import { copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  normalizeCaptureSettings,
  type CaptureSettings,
} from '@shared/capture';

// Persistencia de ajustes de captura en un JSON por máquina. Sin dependencias de
// Electron para poder testearla con un path temporal.
//
// La escritura es atómica (temporal + rename, mismo volumen) y se conserva un `.bak` del último
// JSON válido: un apagón a mitad de un save dejaba el fichero truncado, `load()` lo tomaba por
// corrupto y el usuario perdía todos sus ajustes en silencio.
export class SettingsStore {
  private cached: CaptureSettings | null = null;

  constructor(private readonly filePath: string) {}

  load(): CaptureSettings {
    if (this.cached) return this.cached;
    let parsed = this.leer(this.filePath);
    if (parsed === null) {
      parsed = this.leer(this.rutaBak());
      if (parsed !== null) {
        console.warn('[settings] el fichero de ajustes no se pudo leer: recuperado del respaldo .bak');
      }
    }
    this.cached = normalizeCaptureSettings(parsed);
    return this.cached;
  }

  save(partial: Partial<CaptureSettings>): CaptureSettings {
    const next = normalizeCaptureSettings({ ...this.load(), ...partial });
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
    // Antes de pisar el principal, respaldarlo si parsea: nunca se guarda basura como respaldo.
    if (this.leer(this.filePath) !== null) {
      try {
        copyFileSync(this.filePath, this.rutaBak());
      } catch {
        // sin respaldo esta vez; el rename atómico de abajo sigue protegiendo el principal
      }
    }
    renameSync(tmp, this.filePath); // mismo volumen → atómico: el principal nunca queda a medias
    this.cached = next;
    return next;
  }

  /** JSON parseado del fichero, o null si no existe o está corrupto. */
  private leer(ruta: string): unknown | null {
    try {
      return JSON.parse(readFileSync(ruta, 'utf8')) as unknown;
    } catch {
      return null;
    }
  }

  private rutaBak(): string {
    return `${this.filePath}.bak`;
  }
}
