import { EventEmitter } from 'node:events';
import { mkdirSync } from 'node:fs';
import type { CaptureSettings, CaptureStatus, EncoderInfo } from '@shared/capture';
import type { ClipSource } from '@shared/library';
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

/** Payload del evento 'clip-saved'. */
export interface ClipSavedInfo {
  filePath: string;
  source: ClipSource;
  /** Juego detectado al momento de guardar, si hay. */
  game: string | null;
}

/** Superficie de ObsCapture que usa el manager; inyectable para testear sin libobs. */
export interface CaptureBackend {
  readonly isInitialized: boolean;
  init(paths: { dataPath: string; appVersion: string }): void;
  getAvailableEncoders(): EncoderInfo[];
  buildPipeline(
    settings: CaptureSettings,
    screen: { width: number; height: number },
    outputDir: string,
  ): void;
  startReplayBuffer(): Promise<void>;
  stopReplayBuffer(): Promise<void>;
  saveReplay(): Promise<string>;
  startRecording(): Promise<void>;
  stopRecording(): Promise<string>;
  shutdown(): void;
}

/**
 * Orquesta libobs + ajustes: estado observable, buffer de repetición (siempre activo o
 * solo con juego detectado, según bufferMode), grabación manual y guardado de clips
 * retroactivos. Emite 'status' en cada cambio y 'clip-saved' al guardar.
 */
export class CaptureManager extends EventEmitter {
  private status: CaptureStatus = {
    state: 'initializing',
    error: null,
    lastClipPath: null,
    detectedGame: null,
  };
  private applying = Promise.resolve();
  /** El estado 'recording' no dice si el buffer sigue corriendo por debajo. */
  private bufferRunning = false;

  constructor(
    private readonly store: SettingsStore,
    private readonly env: CaptureEnvironment,
    private readonly obs: CaptureBackend = new ObsCapture(),
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
      await this.rebuildPipeline();
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
      this.applying = this.applying.then(() => this.rebuildPipeline());
      await this.applying;
    }
    return next;
  }

  /**
   * Actualiza el juego detectado. Con bufferMode 'game' arranca/detiene el buffer;
   * una grabación manual en curso nunca se interrumpe.
   */
  async setGameDetected(game: string | null): Promise<void> {
    if (game === this.status.detectedGame) return;
    this.setStatus({ detectedGame: game });
    if (!this.obs.isInitialized || this.getSettings().bufferMode !== 'game') return;
    // Durante una grabación manual no se toca nada; se reconcilia en stopRecording.
    if (this.status.state !== 'idle' && this.status.state !== 'buffering') return;
    try {
      if (game && !this.bufferRunning) {
        await this.startBuffer();
        this.setStatus({ state: 'buffering', error: null });
      } else if (!game && this.bufferRunning) {
        await this.stopBuffer();
        this.setStatus({ state: 'idle', error: null });
      }
    } catch (err) {
      this.setStatus({ error: err instanceof Error ? err.message : String(err) });
    }
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
      await this.reconcileBuffer();
      this.setStatus({
        state: this.bufferRunning ? 'buffering' : 'idle',
        error: null,
        lastClipPath: file,
      });
      this.emitClipSaved(file, 'recording');
    } catch (err) {
      this.setStatus({
        state: this.bufferRunning ? 'buffering' : 'idle',
        error: err instanceof Error ? err.message : String(err),
      });
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
      this.emitClipSaved(file, 'replay');
    } catch (err) {
      this.setStatus({ error: err instanceof Error ? err.message : String(err) });
    }
    return this.getStatus();
  }

  shutdown(): void {
    this.obs.shutdown();
    this.bufferRunning = false;
    this.setStatus({ state: 'unavailable', error: null });
  }

  outputDir(): string {
    const settings = this.store.load();
    return settings.outputDir || this.env.defaultOutputDir;
  }

  /** ¿Debería estar corriendo el buffer con los ajustes y el juego actuales? */
  private shouldBuffer(): boolean {
    return this.getSettings().bufferMode === 'always' || this.status.detectedGame !== null;
  }

  private async startBuffer(): Promise<void> {
    await this.obs.startReplayBuffer();
    this.bufferRunning = true;
  }

  private async stopBuffer(): Promise<void> {
    await this.obs.stopReplayBuffer();
    this.bufferRunning = false;
  }

  /** Alinea el buffer con lo esperado (el juego pudo abrirse/cerrarse durante la grabación). */
  private async reconcileBuffer(): Promise<void> {
    if (this.shouldBuffer() && !this.bufferRunning) await this.startBuffer();
    else if (!this.shouldBuffer() && this.bufferRunning) await this.stopBuffer();
  }

  private async rebuildPipeline(): Promise<void> {
    const settings = this.store.load();
    const outputDir = this.outputDir();
    mkdirSync(outputDir, { recursive: true });
    this.obs.buildPipeline(settings, this.env.primaryDisplay, outputDir);
    this.bufferRunning = false; // la reconstrucción destruye las salidas anteriores
    if (this.shouldBuffer()) {
      await this.startBuffer();
      this.setStatus({ state: 'buffering', error: null });
    } else {
      this.setStatus({ state: 'idle', error: null });
    }
  }

  private emitClipSaved(filePath: string, source: ClipSource): void {
    const info: ClipSavedInfo = { filePath, source, game: this.status.detectedGame };
    this.emit('clip-saved', info);
  }

  private setStatus(patch: Partial<CaptureStatus>): void {
    this.status = { ...this.status, ...patch };
    this.emit('status', this.getStatus());
  }
}
