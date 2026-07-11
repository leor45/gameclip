import type { CaptureSettings } from '@shared/capture';
import type { StorageStats } from '@shared/library';
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
    // Implementación en la tarea de almacenamiento (agente B).
    void outputDir;
    return { clipsBytes: 0, recordingsBytes: 0, driveFreeBytes: 0, driveTotalBytes: 0 };
  }

  /**
   * Si el uso supera el límite y el auto-borrado está activo, elimina los archivos más
   * viejos hasta quedar por debajo. Nunca borra `protectPath` (el clip recién guardado).
   * Devuelve las rutas eliminadas.
   */
  async enforceLimit(
    settings: CaptureSettings,
    outputDir: string,
    opts: { protectPath?: string } = {},
  ): Promise<string[]> {
    // Implementación en la tarea de almacenamiento (agente B).
    void settings;
    void outputDir;
    void opts;
    void this.library;
    void this.deps;
    return [];
  }
}
