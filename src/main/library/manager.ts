import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Clip, ClipSource, ClipsQuery } from '@shared/library';
import { normalizeClipPatch, titleFromFileName } from '@shared/library';
import type { ClipsRepository } from './clips-repository';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.mov', '.flv']);
const DATA_URL_JPEG = 'data:image/jpeg;base64,';

export interface LibraryOptions {
  /** Carpeta donde se guardan los thumbnails (userData/thumbnails). */
  thumbnailsDir: string;
  /** Ventana activa al guardar un clip; inyectable en tests. */
  getForegroundTitle?: () => Promise<string | null>;
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

    if (existsSync(outputDir)) {
      for (const name of readdirSync(outputDir)) {
        const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
        if (!VIDEO_EXTENSIONS.has(ext)) continue;
        const filePath = join(outputDir, name);
        if (this.repo.getByPath(filePath)) continue;
        const stats = statSync(filePath);
        this.repo.insert({
          filePath,
          title: titleFromFileName(name),
          game: null,
          sizeBytes: stats.size,
          createdAt: stats.mtime.toISOString(),
          source: 'scan',
        });
        added++;
      }
    }

    if (added || removed) this.emit('changed');
    return { added, removed };
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
