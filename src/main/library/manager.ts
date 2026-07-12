import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { gameFromFolderName } from '@shared/clip-naming';
import type { GameNameContext } from '@shared/games';
import type { Clip, ClipSource, ClipsQuery } from '@shared/library';
import { normalizeClipPatch, titleFromFileName } from '@shared/library';
import type { ClipsRepository } from './clips-repository';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.mov', '.flv']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const DATA_URL_JPEG = 'data:image/jpeg;base64,';

export interface LibraryOptions {
  /** Carpeta donde se guardan los thumbnails (userData/thumbnails). */
  thumbnailsDir: string;
  /** Ventana activa al guardar un clip; inyectable en tests. */
  getForegroundTitle?: () => Promise<string | null>;
  /**
   * De dónde salen los nombres de los juegos (índice de launchers + juegos manuales). Es una función
   * porque el índice se construye en background y el owner puede re-escanear: hay que leerlo en el
   * momento de usarlo, no capturarlo al arrancar.
   */
  gameNames?: () => GameNameContext;
}

/**
 * Orquesta el catálogo: ingesta de clips guardados, reconciliación con el disco,
 * thumbnails y gestión. Emite 'changed' en cada mutación para push al renderer.
 */
export class LibraryManager extends EventEmitter {
  constructor(
    private readonly repo: ClipsRepository,
    private readonly opts: LibraryOptions,
  ) {
    super();
    // Al migrar, el repo fusiona los clips que estaban duplicados por la ruta; sus miniaturas
    // quedan sin dueño y las borra el manager (tocar el disco no es tarea del repositorio).
    for (const thumbnail of this.repo.takeOrphanThumbnails()) {
      try {
        rmSync(thumbnail, { force: true });
      } catch {
        // best-effort: una miniatura huérfana no rompe nada
      }
    }
  }

  list(query: ClipsQuery = {}): Clip[] {
    return this.repo.list(query);
  }

  games(): string[] {
    return this.repo.games();
  }

  getClip(id: number): Clip | null {
    return this.repo.get(id);
  }

  /**
   * Registra un clip recién guardado por la captura (replay o grabación manual).
   * `gameHint` (detección de juegos) tiene prioridad sobre la ventana en primer plano.
   */
  async registerSavedClip(
    filePath: string,
    source: ClipSource,
    gameHint?: string | null,
  ): Promise<Clip | null> {
    if (!existsSync(filePath) || this.repo.getByPath(filePath)) return null;
    const stats = statSync(filePath);
    const game =
      gameHint ??
      (await (this.opts.getForegroundTitle?.() ?? Promise.resolve(null)).catch(() => null));
    const clip = this.repo.insert({
      filePath,
      title: titleFromFileName(fileName(filePath)),
      game,
      sizeBytes: stats.size,
      createdAt: stats.mtime.toISOString(),
      source,
    });
    this.emit('changed');
    return clip;
  }

  /** Sincroniza el catálogo con la carpeta de salida: altas nuevas y bajas de borrados. */
  reconcile(outputDir: string): { added: number; removed: number } {
    let added = 0;
    let removed = 0;

    for (const { id, filePath } of this.repo.allPaths()) {
      if (!existsSync(filePath)) {
        this.removeThumbnail(this.repo.get(id));
        this.repo.delete(id);
        removed++;
      }
    }

    // Recursivo: desde la Fase 10 los clips viven en `<salida>/<Juego|Desktop>/…` y las capturas en
    // `<Juego>/Capturas/`. La carpeta es la única pista del juego que tiene un archivo escaneado.
    for (const filePath of mediaFilesIn(outputDir)) {
      if (this.repo.getByPath(filePath)) continue;
      const stats = statSync(filePath);
      this.repo.insert({
        filePath,
        title: titleFromFileName(fileName(filePath)),
        game: gameFromPath(outputDir, filePath, this.gameNames()),
        sizeBytes: stats.size,
        createdAt: stats.mtime.toISOString(),
        source: 'scan',
      });
      added++;
    }

    if (added || removed) this.emit('changed');
    return { added, removed };
  }

  /**
   * Re-resuelve el juego de cada clip a partir de su carpeta y actualiza los que cambien. Es lo que
   * hace que los clips viejos de `acblackflag/` pasen a verse como el juego de verdad en cuanto el
   * índice de launchers lo sabe — **sin mover un solo fichero**, solo la columna `game`.
   *
   * Idempotente (correrlo dos veces no cambia nada la segunda), así que puede dispararse al arrancar
   * y cada vez que el owner renombra un juego.
   *
   * OJO si algún día la UI deja editar el juego de un clip suelto: esto lo pisaría en el siguiente
   * arranque. Hoy `ClipCard` solo edita título y etiquetas, así que no hay conflicto.
   */
  relabelGames(outputDir: string): number {
    const ctx = this.gameNames();
    const cambios: { id: number; game: string | null }[] = [];
    for (const clip of this.repo.allGames()) {
      const game = gameFromPath(outputDir, clip.filePath, ctx);
      if (game !== clip.game) cambios.push({ id: clip.id, game });
    }
    if (cambios.length === 0) return 0;

    this.repo.setGames(cambios);
    this.emit('changed');
    return cambios.length;
  }

  private gameNames(): GameNameContext {
    return this.opts.gameNames?.() ?? {};
  }

  updateClip(id: number, rawPatch: unknown): Clip {
    const clip = this.repo.update(id, normalizeClipPatch(rawPatch));
    this.emit('changed');
    return clip;
  }

  /** Duración y/o thumbnail (dataURL JPEG) calculados en el renderer. */
  setClipMedia(id: number, media: { durationSeconds?: number; thumbnailDataUrl?: string }): Clip {
    let thumbnailPath: string | undefined;
    if (media.thumbnailDataUrl) {
      if (!media.thumbnailDataUrl.startsWith(DATA_URL_JPEG)) {
        throw new Error('Thumbnail inválido: se espera un data URL JPEG.');
      }
      mkdirSync(this.opts.thumbnailsDir, { recursive: true });
      thumbnailPath = join(this.opts.thumbnailsDir, `${id}.jpg`);
      writeFileSync(thumbnailPath, Buffer.from(media.thumbnailDataUrl.slice(DATA_URL_JPEG.length), 'base64'));
    }
    const durationSeconds =
      typeof media.durationSeconds === 'number' &&
      Number.isFinite(media.durationSeconds) &&
      media.durationSeconds >= 0
        ? media.durationSeconds
        : undefined;
    const clip = this.repo.setMedia(id, { durationSeconds, thumbnailPath });
    this.emit('changed');
    return clip;
  }

  /**
   * Registra el edit de audio de un clip ya reescrito en disco: pistas muteadas en la mezcla y
   * tamaño nuevo del archivo.
   */
  setAudioEdit(id: number, mutedTracks: string[]): Clip {
    const clip = this.repo.get(id);
    if (!clip) throw new Error(`Clip ${id} no existe.`);
    const sizeBytes = existsSync(clip.filePath) ? statSync(clip.filePath).size : clip.sizeBytes;
    const actualizado = this.repo.setAudioEdit(id, mutedTracks, sizeBytes);
    this.emit('changed');
    return actualizado;
  }

  /** Borra registro, archivo de video y thumbnail. */
  deleteClip(id: number): void {
    const clip = this.repo.get(id);
    if (!clip) return;
    try {
      rmSync(clip.filePath, { force: true });
    } catch {
      // el archivo puede estar bloqueado por el reproductor; el registro se borra igual
    }
    this.removeThumbnail(clip);
    this.repo.delete(id);
    this.emit('changed');
  }

  private removeThumbnail(clip: Clip | null): void {
    if (clip?.thumbnailPath) {
      try {
        rmSync(clip.thumbnailPath, { force: true });
      } catch {
        // best-effort
      }
    }
  }
}

function fileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

/** Videos y capturas de la carpeta de clips, incluidas las subcarpetas por juego. */
function mediaFilesIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...mediaFilesIn(full));
      continue;
    }
    const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase();
    if (VIDEO_EXTENSIONS.has(ext) || IMAGE_EXTENSIONS.has(ext)) out.push(full);
  }
  return out;
}

/**
 * Juego de un archivo escaneado, según la carpeta en la que está: el primer segmento bajo la carpeta
 * de clips (`Terraria/…`, `Desktop/Capturas/…`). Un archivo suelto en la raíz no tiene juego.
 */
function gameFromPath(
  outputDir: string,
  filePath: string,
  ctx: GameNameContext = {},
): string | null {
  const segmentos = relative(outputDir, filePath).split(sep);
  return segmentos.length > 1 ? gameFromFolderName(segmentos[0], ctx) : null;
}
