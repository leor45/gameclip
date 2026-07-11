import { existsSync, statfsSync } from 'node:fs';
import { dirname, parse } from 'node:path';
import type { CaptureSettings } from '@shared/capture';
import type { Clip, StorageStats } from '@shared/library';
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

  getStats(outputDir: string): StorageStats {
    let clipsBytes = 0;
    let recordingsBytes = 0;
    for (const clip of this.library.list()) {
      if (clip.source === 'recording') recordingsBytes += clip.sizeBytes;
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

    return { clipsBytes, recordingsBytes, driveFreeBytes, driveTotalBytes };
  }

  /**
   * Si el uso supera el límite y el auto-borrado está activo, elimina los archivos más
   * viejos hasta quedar por debajo. Nunca borra `protectPath` (el clip recién guardado)
   * ni favoritos; con `onlyDeleteRecordings` respeta también ese filtro.
   * Devuelve las rutas eliminadas.
   */
  async enforceLimit(
    settings: CaptureSettings,
    outputDir: string,
    opts: { protectPath?: string } = {},
  ): Promise<string[]> {
    void outputDir;
    if (settings.storageLimitGb <= 0 || !settings.autoDeleteOldest) return [];

    const limitBytes = settings.storageLimitGb * 1024 ** 3;
    // Ascendente por fecha: recorremos del más viejo al más nuevo, saltando los no elegibles
    // (equivale a "parar si no quedan elegibles" sin tener que re-consultar el repositorio).
    const clips = this.library.list().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let used = clips.reduce((sum, c) => sum + c.sizeBytes, 0);
    const deleted: string[] = [];

    for (const clip of clips) {
      if (used <= limitBytes) break;
      if (clip.filePath === opts.protectPath) continue;
      if (clip.favorite) continue;
      if (settings.onlyDeleteRecordings && clip.source !== 'recording') continue;

      await this.removeClip(clip, settings.useRecycleBin);
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
    this.library.deleteClip(clip.id);
  }
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
