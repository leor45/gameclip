import { EventEmitter } from 'node:events';
import type { Dirent, Stats } from 'node:fs';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { gameFromFolderName } from '@shared/clip-naming';
import type { GameNameContext } from '@shared/games';
import type { Clip, ClipSource, ClipsQuery } from '@shared/library';
import { isTempMediaFile, normalizeClipPatch, titleFromFileName } from '@shared/library';
import { createOfflineOutputVolumeCheck, isInsideDir } from './clip-path';
import type { ClipsRepository } from './clips-repository';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.mov', '.flv']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const DATA_URL_JPEG = 'data:image/jpeg;base64,';

/** Cuántas veces se reintenta borrar el archivo y cuánto se espera entre intentos (backoff lineal). */
const DELETE_ATTEMPTS = 6;
const DELETE_DELAY_MS = 150;
/** Códigos con los que Windows avisa de que el archivo está tomado por otro handle. */
const BLOQUEADO = new Set(['EPERM', 'EACCES', 'EBUSY']);

export interface LibraryOptions {
  /** Carpeta donde se guardan los thumbnails (userData/thumbnails). */
  thumbnailsDir: string;
  /** Borra el archivo del clip; inyectable en tests para simular un archivo bloqueado. */
  removeFile?: (filePath: string) => void;
  /** Espera entre reintentos de borrado; inyectable en tests. */
  sleep?: (ms: number) => Promise<void>;
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
  /** Filas que la red de seguridad del último `reconcile` retuvo sin poder ver sus archivos. */
  private retenidas: ReadonlySet<number> = new Set();

  constructor(
    private readonly repo: ClipsRepository,
    private readonly opts: LibraryOptions,
  ) {
    super();
    // Al migrar, el repo fusiona los clips que estaban duplicados por la ruta.
    this.removeOrphanThumbnails();
  }

  /**
   * Borra las miniaturas que quedaron sin dueño al fusionar filas (en la migración o en `reconcile`):
   * tocar el disco no es tarea del repositorio, que solo las anota.
   */
  private removeOrphanThumbnails(): void {
    for (const thumbnail of this.repo.takeOrphanThumbnails()) {
      try {
        rmSync(thumbnail, { force: true });
      } catch {
        // best-effort: una miniatura huérfana no rompe nada
      }
    }
  }

  /**
   * Ids de las filas que el último `reconcile` retuvo porque el escaneo no vio ningún archivo (ver la
   * red de seguridad de `reconcile`). Solo lectura; vacío si la red no actuó. El almacenamiento los deja
   * fuera del uso y del auto-borrado: no se sabe si sus archivos existen.
   */
  heldIds(): ReadonlySet<number> {
    return this.retenidas;
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
   * El juego es el que dice la detección (`gameHint`); sin él (escritorio) el clip no tiene juego. Ya no
   * se usa el título de la ventana en primer plano: contradecía a la carpeta en la que se guarda.
   */
  async registerSavedClip(
    filePath: string,
    source: ClipSource,
    gameHint?: string | null,
  ): Promise<Clip | null> {
    if (!existsSync(filePath) || this.repo.getByPath(filePath)) return null;
    const stats = statSync(filePath);
    const game = gameHint ?? null;
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

  /**
   * Sincroniza el catálogo con la carpeta de salida: altas nuevas y bajas de borrados.
   *
   * Un clip cuyo archivo falta se da de baja, salvo que viva en la unidad de la carpeta de clips y esa
   * unidad no esté montada (un USB, o una de red que aún no conectó al arrancar con Windows): ahí el
   * archivo no se borró, solo no se ve, y dar de baja la fila perdía para siempre título, etiquetas,
   * favorito y pistas muteadas. Las filas de **otra** unidad que no está (una carpeta de salida
   * anterior) sí se dan de baja: si el owner copió esa carpeta a la nueva y quitó el USB, conservarlas
   * duplicaba la biblioteca para siempre.
   *
   * **Rescate de filas muertas.** Las bajas se aplican al FINAL del escaneo, no antes: una fila cuyo
   * archivo falta (muerta) puede ser un archivo que cambió de ruta —la carpeta de clips movida o
   * renombrada, o re-apuntada tras un junction o una unidad que ya no se reconecta— y que el escaneo va
   * a encontrar en su sitio nuevo. Si un archivo de dentro sin fila se llama como UNA sola fila muerta
   * (sin distinguir mayúsculas), tiene su mismo tamaño y es el único archivo sin fila con ese nombre,
   * se re-apunta esa fila (no es alta ni baja) y conserva título, favorito, etiquetas, miniatura,
   * duración y pistas muteadas. Con ambigüedad no se rescata nada de ese nombre; una fila muerta sin
   * pareja se da de baja como siempre (y una fila muerta nunca protege nada por sí misma). El rescate
   * usa el `stat` que ya se hace para el alta: ninguna consulta nueva al disco.
   *
   * **Sin ver ningún archivo, no se borra lo de dentro.** Si el escaneo de la carpeta de clips no
   * encuentra NINGÚN archivo multimedia (carpeta inexistente, ilegible o vacía) las filas muertas que
   * cuelgan de ella se conservan en esa pasada: no hay a qué rescatar y la causa habitual no es que el
   * usuario lo borrara todo, sino que la carpeta no está (un junction o un volumen montado en carpeta
   * que se desmontó, una carpeta renombrada o movida con la app cerrada; el arranque escanea antes de que
   * la captura cree la carpeta). Las filas muertas de fuera de la carpeta sí se dan de baja. **Coste
   * aceptado:** si el usuario vacía a mano toda la carpeta desde el Explorador, sus tarjetas se quedan
   * hasta que haya al menos un archivo en ella (el siguiente clip guardado y el siguiente escaneo, que
   * entonces las da de baja si no tienen pareja) o hasta que las borre desde la app. Mientras tanto no cuentan para el uso ni son elegibles para el
   * auto-borrado (igual que las de la unidad sin montar, D5-BUG-3): contarlas borraría clips reales
   * para bajar de un uso que no existe, y 'borrar' las fantasma perdería justo los datos que la red
   * conserva. Lo que retuvo el ÚLTIMO `reconcile` se expone en `heldIds()` (se reemplaza en cada
   * pasada, vacío si la red no actuó, y no consulta el disco).
   *
   * **La misma carpeta por dos caminos.** Una unidad de red vista como `Z:\Clips` y como
   * `\\nas\recurso\Clips`, un junction o un volumen montado en una carpeta: si la carpeta de clips pasa de
   * una forma a la otra, las filas de la forma vieja (su archivo existe, por la otra ruta) no cuelgan de
   * la carpeta nueva y el escaneo daba de alta los mismos archivos otra vez. Esas «filas de fuera» se
   * reconocen por la identidad física del archivo (volumen + índice de archivo + tamaño + fecha de
   * creación, `stat`):
   * - un archivo de dentro sin fila cuyo archivo ES el de una fila de fuera **re-apunta** esa fila (no es
   *   alta ni baja; conserva título, favorito, etiquetas, miniatura, duración y pistas muteadas);
   * - si ya tenía fila (el duplicado que dejó la v0.9.7) se **fusionan** en la de menor id, y cada fila
   *   que sobra cuenta como baja.
   * Dos archivos distintos con el mismo nombre y tamaño (la carpeta copiada con el Explorador) tienen
   * identidad distinta (otro índice y otra fecha de creación): siguen siendo dos filas.
   *
   * **Coste:** `stat` es una ida y vuelta al servidor en un NAS y esto corre en el hilo principal en cada
   * guardado de Ajustes y al arrancar, así que la identidad solo se pide donde puede haber pareja, y
   * eso se decide por el **nombre de archivo**, sin tocar el disco: las tres formas del bug conservan
   * el nombre. Solo se mira la identidad de las filas de fuera cuyo nombre coincide con el de algún
   * archivo de dentro y, luego, la de los archivos de dentro que se llaman como alguna de ellas. Sin
   * filas de fuera, o con una carpeta anterior de clips distintos —lo más común—, no se hace ninguna
   * consulta más al disco. **Con una carpeta anterior que contiene los mismos nombres** (la copia del
   * Explorador mientras la vieja sigue existiendo) esas consultas se repiten en cada escaneo mientras
   * la vieja exista. Queda fuera, a propósito, el hard link con otro nombre.
   */
  reconcile(outputDir: string): { added: number; removed: number } {
    let added = 0;
    let removed = 0;
    let unificadas = 0;

    const enSalidaSinMontar = createOfflineOutputVolumeCheck(outputDir);
    const filasDeFuera: { id: number; filePath: string }[] = [];
    // Las que hoy se darían de baja; se borran al final, tras intentar rescatarlas.
    const muertas = new Map<number, { id: number; filePath: string }>();
    for (const { id, filePath } of this.repo.allPaths()) {
      // En la unidad de la salida se mira la unidad antes que el archivo: sin montar, sus clips se
      // conservan sin preguntar por cada uno.
      if (enSalidaSinMontar(filePath)) continue;
      if (existsSync(filePath)) {
        if (outputDir.trim() !== '' && !isInsideDir(outputDir, filePath)) {
          filasDeFuera.push({ id, filePath });
        }
        continue;
      }
      muertas.set(id, { id, filePath });
    }
    const muertasPorNombre = new Map<string, number[]>();
    for (const { id, filePath } of muertas.values()) {
      const nombre = nombreEnMinusculas(filePath);
      muertasPorNombre.set(nombre, [...(muertasPorNombre.get(nombre) ?? []), id]);
    }

    // Recursivo: desde la Fase 10 los clips viven en `<salida>/<Juego|Desktop>/…` y las capturas en
    // `<Juego>/Capturas/`. La carpeta es la única pista del juego que tiene un archivo escaneado.
    const archivos = mediaFilesIn(outputDir).map((filePath) => ({
      filePath,
      existente: this.repo.getByPath(filePath),
    }));
    // Archivos sin fila por nombre: el rescate exige que sea el único con ese nombre.
    const sinFilaPorNombre = new Map<string, number>();
    for (const { filePath, existente } of archivos) {
      if (existente) continue;
      const nombre = nombreEnMinusculas(filePath);
      sinFilaPorNombre.set(nombre, (sinFilaPorNombre.get(nombre) ?? 0) + 1);
    }

    // Prefiltro por nombre de archivo, sin tocar el disco: el mismo archivo visto por otro camino
    // conserva su nombre, así que solo se pide la identidad de las filas de fuera que se llaman como
    // algún archivo de dentro y, después, de los archivos de dentro que se llaman como alguna de ellas.
    // Una carpeta anterior con clips distintos —lo más común— no cuesta ni un `stat`.
    const nombresDeDentro = new Set(archivos.map((a) => nombreEnMinusculas(a.filePath)));
    const candidatas = filasDeFuera.filter((f) =>
      nombresDeDentro.has(nombreEnMinusculas(f.filePath)),
    );
    const { porIdentidad, nombres: nombresConIdentidad } = idsPorIdentidad(candidatas);
    for (const { filePath, existente } of archivos) {
      // El archivo apareció entre la comprobación de la fila y el escaneo: la fila no está muerta.
      if (existente) muertas.delete(existente.id);

      const identidad =
        porIdentidad.size > 0 && nombresConIdentidad.has(nombreEnMinusculas(filePath))
          ? identidadDe(filePath)
          : null;
      const idsDeFuera = identidad === null ? undefined : porIdentidad.get(identidad.huella);
      if (identidad !== null && idsDeFuera) {
        porIdentidad.delete(identidad.huella); // cada fila de fuera se usa una sola vez
        try {
          removed += this.unificar(filePath, existente, idsDeFuera, identidad.size);
          unificadas++;
        } catch (err) {
          // Una fila que no se deja no corta el escaneo: queda como estaba y se reintenta en el próximo.
          console.error(
            '[library] no se pudo unificar una fila con la ruta de su mismo archivo:',
            err,
          );
        }
        continue;
      }

      if (existente) continue;
      let stats: Stats;
      try {
        stats = statSync(filePath);
      } catch {
        continue; // borrado o ilegible entre el listado y el stat: lo verá el próximo escaneo
      }

      if (this.rescatar(filePath, stats.size, muertas, muertasPorNombre, sinFilaPorNombre)) {
        unificadas++;
        continue;
      }
      this.repo.insert({
        filePath,
        title: titleFromFileName(fileName(filePath)),
        game: gameFromPath(outputDir, filePath, this.gameNames()) ?? null, // mediaFilesIn solo da archivos de dentro
        sizeBytes: stats.size,
        createdAt: stats.mtime.toISOString(),
        source: 'scan',
      });
      added++;
    }

    // Las que no se rescataron: su archivo no está en ninguna parte de la carpeta de clips. Salvo que el
    // escaneo no haya visto NINGÚN archivo (carpeta inexistente, ilegible o vacía): sin poder ver los
    // archivos no se da de baja lo que cuelga de ella (como D5-BUG-3). Lo de fuera de la carpeta, sí.
    const sinVerNada = archivos.length === 0;
    const retenidas = new Set<number>();
    for (const { id, filePath } of muertas.values()) {
      if (sinVerNada && isInsideDir(outputDir, filePath)) {
        retenidas.add(id);
        continue;
      }
      this.removeThumbnail(this.repo.get(id));
      this.repo.delete(id);
      removed++;
    }
    // Se reemplaza en cada pasada: vacío si la red no actuó. Si cambia lo que cuenta para el uso, el
    // renderer debe releerlo.
    const cambioLaRetencion =
      retenidas.size !== this.retenidas.size ||
      [...retenidas].some((id) => !this.retenidas.has(id));
    this.retenidas = retenidas;

    if (added || removed || unificadas || cambioLaRetencion) this.emit('changed');
    return { added, removed };
  }

  /**
   * ¿Es el archivo nuevo `filePath` (sin fila, de `size` bytes) el de una fila muerta que cambió de
   * ruta? Solo si hay exactamente UNA fila muerta con su nombre, es el único archivo sin fila con ese
   * nombre y la fila tiene su tamaño: entonces la re-apunta (y la saca de las muertas). Con cualquier
   * ambigüedad, o un fallo al escribir, no rescata y el archivo se da de alta como siempre.
   */
  private rescatar(
    filePath: string,
    size: number,
    muertas: Map<number, unknown>,
    muertasPorNombre: Map<string, number[]>,
    sinFilaPorNombre: Map<string, number>,
  ): boolean {
    const nombre = nombreEnMinusculas(filePath);
    const ids = muertasPorNombre.get(nombre);
    if (ids?.length !== 1 || !muertas.has(ids[0]) || sinFilaPorNombre.get(nombre) !== 1) {
      return false;
    }
    const fila = this.repo.get(ids[0]);
    if (!fila || fila.sizeBytes !== size) return false;
    try {
      this.repo.setPath(fila.id, filePath);
    } catch (err) {
      console.error('[library] no se pudo re-apuntar una fila cuyo archivo cambió de ruta:', err);
      return false;
    }
    muertas.delete(fila.id);
    return true;
  }

  /**
   * El archivo `filePath` (de dentro de la carpeta de clips, de `sizeBytes` bytes) es el mismo que el de
   * las filas `idsDeFuera`, que lo catalogaron por otro camino. Si no tenía fila propia, la primera se
   * re-apunta a esta ruta y conserva todo; si la tenía (el duplicado de la v0.9.7) o hay varias de
   * fuera, se fusionan en la de menor id y la miniatura que sobra se borra. En ambos casos el tamaño
   * queda el real, y al fusionar el título y las pistas muteadas son los personalizados (las filas son
   * el mismo archivo: lo que se hizo sobre cualquiera de las tarjetas vale). Devuelve cuántas filas
   * desaparecen (las bajas).
   */
  private unificar(
    filePath: string,
    existente: Clip | null,
    idsDeFuera: number[],
    sizeBytes: number,
  ): number {
    const ids = [...new Set(existente ? [existente.id, ...idsDeFuera] : idsDeFuera)];
    if (ids.length === 1) {
      this.repo.setPath(ids[0], filePath, sizeBytes);
      return 0;
    }
    this.repo.mergeRows(ids, filePath, {
      sizeBytes,
      defaultTitle: titleFromFileName(fileName(filePath)),
    });
    this.removeOrphanThumbnails();
    return ids.length - 1;
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
      if (game === undefined) continue; // fuera de la carpeta actual: su carpeta no dice nada
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

  /**
   * Borra archivo de video, thumbnail y registro. El registro **solo** se borra si el archivo se
   * pudo borrar (o ya no existía): dejar el archivo huérfano lo hacía reaparecer en el siguiente
   * `reconcile`. Si el archivo sigue en uso tras los reintentos, lanza y no toca la DB.
   */
  async deleteClip(id: number): Promise<void> {
    const clip = this.repo.get(id);
    if (!clip) return;
    await this.removeClipFile(clip.filePath);
    this.removeThumbnail(clip);
    this.repo.delete(id);
    if (this.retenidas.has(id)) {
      const resto = new Set(this.retenidas);
      resto.delete(id);
      this.retenidas = resto;
    }
    this.emit('changed');
  }

  /**
   * Borra el archivo reintentando mientras esté tomado. En Windows lo tiene abierto la propia app: el
   * `<video>` de la preview lo lee por el protocolo `gameclip-media://` (handle vivo sin
   * `FILE_SHARE_DELETE`), así que `rmSync` da `EBUSY`. La tarjeta suelta la preview antes de borrar,
   * pero cerrar el handle es asíncrono; los reintentos cubren esa ventana — y de paso bloqueos ajenos
   * transitorios (indexador de Windows, antivirus). `force:true` hace no-op de un archivo ya inexistente.
   */
  private async removeClipFile(filePath: string): Promise<void> {
    const remove = this.opts.removeFile ?? ((p: string) => rmSync(p, { force: true }));
    const sleep = this.opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

    for (let intento = 1; intento <= DELETE_ATTEMPTS; intento++) {
      try {
        remove(filePath);
        return;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code ?? '';
        if (!BLOQUEADO.has(code)) throw err;
        if (intento === DELETE_ATTEMPTS) {
          // El EBUSY crudo no le dice nada al usuario; el motivo real sí.
          throw new Error(
            'El archivo del clip está en uso y no se pudo borrar. Cerralo en el reproductor ' +
              '(o esperá unos segundos) y volvé a intentar.',
          );
        }
        await sleep(DELETE_DELAY_MS * intento);
      }
    }
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

/**
 * Identidad física de un archivo: volumen + índice de archivo + tamaño + fecha de creación (en
 * Windows, el número de serie del volumen, el índice NTFS/SMB y la fecha de creación del archivo).
 * Dos rutas que llevan al mismo archivo —`Z:\` y `\\nas\recurso\`, un junction, un hard link— dan la
 * misma (medido: también por `\\localhost\C$\…`); dos copias, no, aunque tengan el mismo nombre,
 * tamaño y fecha de modificación: la copia del Explorador conserva el mtime pero tiene fecha de
 * creación nueva. Esa fecha es la red de seguridad de los sistemas de archivos donde el índice de 64
 * bits no es único (ReFS, Dev Drive) o es constante. `null` si no se puede saber: el `stat` falla
 * (permisos, archivo que desapareció), el índice es 0 (algunos SMB) o `0xFFFFFFFFFFFFFFFF`
 * (`FILE_INVALID_FILE_ID`) o el archivo está vacío (en FAT/exFAT no ocupa clúster y su índice no lo
 * distingue de otro vacío): no hay forma de afirmar que dos rutas son el mismo archivo y se tratan como
 * distintos. Devuelve también el tamaño real, que el escaneo escribe en la fila.
 */
function identidadDe(filePath: string): { huella: string; size: number } | null {
  try {
    const stats = statSync(filePath, { bigint: true });
    if (stats.ino === 0n || stats.ino === INDICE_INVALIDO || stats.size === 0n) return null;
    return {
      huella: `${stats.dev}:${stats.ino}:${stats.size}:${stats.birthtimeNs}`,
      size: Number(stats.size),
    };
  } catch {
    return null;
  }
}

/** `FILE_INVALID_FILE_ID`: lo que devuelven algunos sistemas de archivos virtuales como índice. */
const INDICE_INVALIDO = 0xffffffffffffffffn;

/** Nombre del archivo en minúsculas (NTFS no distingue mayúsculas): la clave del prefiltro. */
function nombreEnMinusculas(filePath: string): string {
  return fileName(filePath).toLowerCase();
}

/**
 * Ids de las filas por identidad física del archivo (las que no tienen identidad no entran) y los
 * nombres, en minúsculas, de las que sí.
 */
function idsPorIdentidad(filas: { id: number; filePath: string }[]): {
  porIdentidad: Map<string, number[]>;
  nombres: Set<string>;
} {
  const porIdentidad = new Map<string, number[]>();
  const nombres = new Set<string>();
  for (const { id, filePath } of filas) {
    const identidad = identidadDe(filePath);
    if (identidad === null) continue;
    nombres.add(nombreEnMinusculas(filePath));
    const ids = porIdentidad.get(identidad.huella);
    if (ids) ids.push(id);
    else porIdentidad.set(identidad.huella, [id]);
  }
  return { porIdentidad, nombres };
}

/**
 * Carpetas de sistema que Windows crea en la raíz de cada volumen (y de cada volumen montado en una
 * carpeta). Si la carpeta de clips es la raíz de una unidad, `System Volume Information` no se deja
 * leer y la papelera sí — y catalogaba los videos borrados.
 */
const CARPETAS_DE_SISTEMA = new Set(['$recycle.bin', 'system volume information']);

/**
 * Videos y capturas de la carpeta de clips, incluidas las subcarpetas por juego. Una carpeta que no
 * se deja leer (permisos, desaparecida a mitad) se salta sin cortar el resto del recorrido.
 */
function mediaFilesIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (CARPETAS_DE_SISTEMA.has(entry.name.toLowerCase())) continue;
      out.push(...mediaFilesIn(full));
      continue;
    }
    // Los temporales de ffmpeg (remux de nombres, «Guardar edit») viven junto al clip mientras dura
    // la operación: catalogarlos dejaba una tarjeta fantasma al renombrarse.
    if (isTempMediaFile(entry.name)) continue;
    const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase();
    if (VIDEO_EXTENSIONS.has(ext) || IMAGE_EXTENSIONS.has(ext)) out.push(full);
  }
  return out;
}

/**
 * Juego de un archivo escaneado, según la carpeta en la que está: el primer segmento bajo la carpeta
 * de clips (`Terraria/…`, `Desktop/Capturas/…`). Un archivo suelto en la raíz no tiene juego.
 *
 * `undefined` = el archivo no cuelga de `outputDir` (carpeta de salida anterior u otra unidad): ahí
 * `relative` empieza por `..` o es absoluta, y su primer segmento NO es un juego.
 */
function gameFromPath(
  outputDir: string,
  filePath: string,
  ctx: GameNameContext = {},
): string | null | undefined {
  const rel = relative(outputDir, filePath);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return undefined;
  const segmentos = rel.split(sep);
  return segmentos.length > 1 ? gameFromFolderName(segmentos[0], ctx) : null;
}
