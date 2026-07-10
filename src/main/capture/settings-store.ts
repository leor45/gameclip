import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  normalizeCaptureSettings,
  type CaptureSettings,
} from '@shared/capture';

// Persistencia de ajustes de captura en un JSON por máquina. Sin dependencias de
// Electron para poder testearla con un path temporal.
export class SettingsStore {
  private cached: CaptureSettings | null = null;

  constructor(private readonly filePath: string) {}

  load(): CaptureSettings {
    if (this.cached) return this.cached;
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(readFileSync(this.filePath, 'utf8'));
    } catch {
      // archivo inexistente o corrupto → defaults
    }
    this.cached = normalizeCaptureSettings(parsed);
    return this.cached;
  }

  save(partial: Partial<CaptureSettings>): CaptureSettings {
    const next = normalizeCaptureSettings({ ...this.load(), ...partial });
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(next, null, 2), 'utf8');
    this.cached = next;
    return next;
  }
}
