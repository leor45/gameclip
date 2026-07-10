import { EventEmitter } from 'node:events';
import { mkdirSync } from 'node:fs';
import type { CaptureSettings, CaptureStatus, EncoderInfo } from '@shared/capture';
import { ObsCapture } from './obs';
import type { SettingsStore } from './settings-store';

export interface CaptureEnvironment {
  /** Carpeta de datos para libobs (config interna). */
  obsDataPath: string;
  /** Carpeta de salida por defecto (Videos/GameClip). */
  defaultOutputDir: string;
  appVersion: string;
  primaryDisplay: { width: number; height: number };
}

/**
 * Orquesta libobs + ajustes: estado observable, buffer de repetición siempre activo,
 * grabación manual y guardado de clips retroactivos. Emite 'status' en cada cambio.
 */
export class CaptureManager extends EventEmitter {
  private status: CaptureStatus = { state: 'initializing', error: null, lastClipPath: null };
  private obs = new ObsCapture();
  private applying = Promise.resolve();

  constructor(
    private readonly store: SettingsStore,
    private readonly env: CaptureEnvironment,
  ) {
    super();
  }

  getStatus(): CaptureStatus {
    return { ...this.status };
  }

  getSettings(): CaptureSettings {
    return this.store.load();
  }

  getEncoders(): EncoderInfo[] {
    return this.obs.isInitialized ? this.obs.getAvailableEncoders() : [];
  }

  /** Init completa: si libobs falla, el estado queda 'unavailable' y la app sigue. */
  async initialize(): Promise<void> {
    try {
      this.obs.init({ dataPath: this.env.obsDataPath, appVersion: this.env.appVersion });
      await this.rebuildAndStartBuffer();
    } catch (err) {
      this.setStatus({
        state: 'unavailable',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async setSettings(partial: Partial<CaptureSettings>): Promise<CaptureSettings> {
    const next = this.store.save(partial);
    this.emit('settings', next);
    if (this.obs.isInitialized && this.status.state !== 'recording') {
      // Serializa reconstrucciones si llegan varias seguidas.
      this.applying = this.applying.then(() => this.rebuildAndStartBuffer());
      await this.applying;
    }
    return next;
  }

  async startRecording(): Promise<CaptureStatus> {
    if (this.status.state !== 'buffering' && this.status.state !== 'idle') {
      return this.getStatus();
    }
    try {
      await this.obs.startRecording();
      this.setStatus({ state: 'recording', error: null });
    } catch (err) {
      this.setStatus({ error: err instanceof Error ? err.message : String(err) });
    }
    return this.getStatus();
  }

  async stopRecording(): Promise<CaptureStatus> {
    if (this.status.state !== 'recording') return this.getStatus();
    try {
      const file = await this.obs.stopRecording();
      this.setStatus({ state: 'buffering', error: null, lastClipPath: file });
    } catch (err) {
      this.setStatus({ state: 'buffering', error: err instanceof Error ? err.message : String(err) });
    }
    return this.getStatus();
  }

  async saveReplay(): Promise<CaptureStatus> {
    if (this.status.state !== 'buffering' && this.status.state !== 'recording') {
      return this.getStatus();
    }
    try {
      const file = await this.obs.saveReplay();
      this.setStatus({ error: null, lastClipPath: file });
    } catch (err) {
      this.setStatus({ error: err instanceof Error ? err.message : String(err) });
    }
    return this.getStatus();
  }

  shutdown(): void {
    this.obs.shutdown();
    this.setStatus({ state: 'unavailable', error: null });
  }

  outputDir(): string {
    const settings = this.store.load();
    return settings.outputDir || this.env.defaultOutputDir;
  }

  private async rebuildAndStartBuffer(): Promise<void> {
    const settings = this.store.load();
    const outputDir = this.outputDir();
    mkdirSync(outputDir, { recursive: true });
    this.obs.buildPipeline(settings, this.env.primaryDisplay, outputDir);
    await this.obs.startReplayBuffer();
    this.setStatus({ state: 'buffering', error: null });
  }

  private setStatus(patch: Partial<CaptureStatus>): void {
    this.status = { ...this.status, ...patch };
    this.emit('status', this.getStatus());
  }
}
