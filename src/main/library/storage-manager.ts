import { existsSync, statfsSync } from 'node:fs';
import { dirname, parse } from 'node:path';
import type { CaptureSettings } from '@shared/capture';
import type { Clip, StorageStats } from '@shared/library';
import { createOfflineOutputVolumeCheck, isInsideDir } from './clip-path';
import type { LibraryManager } from './manager';

export interface StorageManagerDeps {
  /** Envía un archivo a la papelera; inyectable en tests (shell.trashItem en producción). */
  trashItem?: (path: string) => Promise<void>;
}

/**
 * Gestión de espacio de la carpeta de clips: uso de disco y auto-borrado de los archivos
 * más viejos al superar el límite configurado (storageLimitGb).
 */
export class StorageManager {
  constructor(
    private readonly library: LibraryManager,
    private readonly deps: StorageManagerDeps = {},
  ) {}

  /**
   * Uso de la carpeta de clips y espacio del disco. Mide lo mismo que el límite (ver
   * `enforceLimit`): solo cuentan los clips que cuelgan de `outputDir`, no están en su unidad sin
   * montar y no los retuvo la red de seguridad del último escaneo (`heldIds()`). Si no, el indicador de la barra lateral y de Ajustes → Almacenamiento marcaría «por
   * encima del límite» sin que el auto-borrado hiciera nada.
   */
  getStats(outputDir: string): StorageStats {
    let clipsBytes = 0;
    let recordingsBytes = 0;
    let screenshotsBytes = 0;
    const cuenta = clipsDeLaCarpeta(outputDir, this.library.heldIds());
    for (const clip of this.library.list()) {
      if (!cuenta(clip)) continue;
      if (clip.kind === 'image') screenshotsBytes += clip.sizeBytes;
      else if (clip.source === 'recording') recordingsBytes += clip.sizeBytes;
      else clipsBytes += clip.sizeBytes;
    }

    let driveFreeBytes = 0;
    let driveTotalBytes = 0;
    try {
      const stats = statfsSync(nearestExistingDir(outputDir));
      driveFreeBytes = stats.bavail * stats.bsize;
      driveTotalBytes = stats.blocks * stats.bsize;
    } catch {
      // unidad desmontada, permisos, etc.: se informan ceros en vez de propagar el error
    }

    return { clipsBytes, recordingsBytes, screenshotsBytes, driveFreeBytes, driveTotalBytes };
  }

  /**
   * Si el uso supera el límite y el auto-borrado está activo, elimina los archivos más
   * viejos hasta quedar por debajo. Nunca borra `protectPath` (el clip recién guardado),
   * favoritos ni **capturas de pantalla** (pesan poco y son irrecuperables: el límite es para los
   * videos, aunque las capturas cuenten para medirlo); con `onlyDeleteRecordings` respeta también
   * ese filtro. Devuelve las rutas eliminadas.
   *
   * Con `outputDir` (la carpeta de clips ya resuelta) **solo cuentan para el uso y solo son elegibles
   * para borrar los clips que cuelgan de ella**. Quien cambia la carpeta de clips conserva la anterior
   * (y, si la copió con el Explorador, tiene los mismos clips dos veces: la copia, ya catalogada, y los
   * originales, cuyas filas siguen vivas mientras su archivo exista). Contar la carpeta anterior medía
   * el doble y el auto-borrado se llevaba los clips más viejos —los originales o las copias— con el
   * uso real por debajo del límite: pérdida de datos. Lo de fuera no es de la carpeta que GameClip
   * gestiona, así que ni se mide ni se toca.
   *
   * Además, los clips de la unidad de la carpeta de clips cuando no está montada tampoco cuentan ni se
   * borran: son las filas sin archivo que el escaneo conserva (D5-BUG-3), «borrarlos» no libera nada
   * (el archivo sigue en el USB) y destruye sus ediciones. Esa unidad es la única a la que se le
   * pregunta al disco; el resto se juzga por la ruta (una unidad de red caída bloquea el hilo
   * principal segundos). Tampoco cuentan ni se borran las filas que la red de seguridad del último
   * escaneo retuvo (`LibraryManager.heldIds()`: el escaneo no vio ningún archivo en la carpeta, p. ej.
   * un junction borrado con la app cerrada): se ignora si sus archivos existen, contarlas borraría
   * clips reales para bajar de un uso que no existe y «borrarlas» perdería los datos que la red
   * conserva. Sin `outputDir` no se deja fuera nada.
   */
  async enforceLimit(
    settings: CaptureSettings,
    opts: { protectPath?: string; outputDir?: string } = {},
  ): Promise<string[]> {
    if (settings.storageLimitGb <= 0 || !settings.autoDeleteOldest) return [];

    const limitBytes = settings.storageLimitGb * 1024 ** 3;
    const cuenta = clipsDeLaCarpeta(opts.outputDir, this.library.heldIds());
    // Ascendente por fecha: recorremos del más viejo al más nuevo, saltando los no elegibles
    // (equivale a "parar si no quedan elegibles" sin tener que re-consultar el repositorio).
    const clips = this.library
      .list()
      .filter((c) => cuenta(c))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let used = clips.reduce((sum, c) => sum + c.sizeBytes, 0);
    const deleted: string[] = [];

    for (const clip of clips) {
      if (used <= limitBytes) break;
      if (clip.filePath === opts.protectPath) continue;
      if (clip.favorite) continue;
      if (clip.kind === 'image') continue;
      if (settings.onlyDeleteRecordings && clip.source !== 'recording') continue;

      // Un clip en uso (el usuario lo está viendo) no se puede liberar ahora: se salta sin contarlo
      // ni abortar la poda; la próxima pasada lo reintenta.
      try {
        await this.removeClip(clip, settings.useRecycleBin);
      } catch {
        continue;
      }
      deleted.push(clip.filePath);
      used -= clip.sizeBytes;
    }

    return deleted;
  }

  private async removeClip(clip: Clip, useRecycleBin: boolean): Promise<void> {
    if (useRecycleBin && this.deps.trashItem) {
      try {
        await this.deps.trashItem(clip.filePath);
      } catch {
        // la papelera falló (permisos, ruta ya movida, etc.): cae a borrado definitivo
      }
    }
    // deleteClip limpia registro + thumbnail; si el archivo ya fue a la papelera, su
    // rmSync interno (force:true) es un no-op.
    await this.library.deleteClip(clip.id);
  }
}

/**
 * ¿Cuenta este clip para el uso y el límite? Sí si cuelga de la carpeta de clips, no lo retuvo la red
 * de seguridad del último escaneo (`LibraryManager.heldIds()`: filas cuyo archivo no se pudo ver
 * porque el escaneo no encontró ningún archivo; contarlas borraría clips reales para bajar de un uso
 * que no existe y «borrarlas» perdería los datos que la red conserva) y no vive en su unidad sin
 * montar. Sin carpeta (o vacía) cuenta todo. El orden importa: lo de fuera se descarta por
 * la ruta, sin tocar el disco; la comprobación de la unidad (una sola consulta por pasada) solo se
 * hace para lo que está dentro.
 */
function clipsDeLaCarpeta(
  outputDir: string | undefined,
  retenidas: ReadonlySet<number>,
): (clip: Clip) => boolean {
  if (!outputDir?.trim()) return () => true;
  const enSalidaSinMontar = createOfflineOutputVolumeCheck(outputDir);
  return (clip) =>
    isInsideDir(outputDir, clip.filePath) &&
    !retenidas.has(clip.id) &&
    !enSalidaSinMontar(clip.filePath);
}

/** Sube por los padres hasta encontrar un directorio existente, o la raíz de la unidad. */
function nearestExistingDir(path: string): string {
  const root = parse(path).root;
  let dir = path;
  while (dir !== root && !existsSync(dir)) {
    dir = dirname(dir);
  }
  return dir;
}
