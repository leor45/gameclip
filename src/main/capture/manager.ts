import { EventEmitter } from 'node:events';
import { mkdirSync } from 'node:fs';
import type {
  AudioDeviceInfo,
  CaptureSettings,
  CaptureStatus,
  EncoderInfo,
} from '@shared/capture';
import { KNOWN_GAME_PROCESSES } from '@shared/games';
import type { ClipSource } from '@shared/library';
import { ObsCapture } from './obs';
import type { SettingsStore } from './settings-store';

/**
 * Ejecutable del juego a partir de su nombre legible (lookup inverso en KNOWN_GAME_PROCESSES).
 * El detector solo emite el nombre; la captura de audio por proceso necesita el .exe.
 * Devuelve la primera coincidencia (aproximación: varios procesos pueden mapear al mismo juego).
 */
export function gameExecutableForName(game: string | null): string | null {
  if (!game) return null;
  for (const [proc, name] of Object.entries(KNOWN_GAME_PROCESSES)) {
    if (name === game) return `${proc}.exe`;
  }
  return null;
}

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
  getAudioDevices(): AudioDeviceInfo[];
  buildPipeline(
    settings: CaptureSettings,
    screen: { width: number; height: number },
    outputDir: string,
    gameExecutable: string | null,
  ): void;
  /** Religa el audio del juego (modo apps) a otro ejecutable sin reconstruir el pipeline. */
  updateGameAudioTarget(executable: string | null): void;
  /** Mutea/abre el micrófono sin reconstruir el pipeline (push-to-talk). */
  setMicMuted(muted: boolean): void;
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
  /** Ejecutable del juego detectado (el proceso real que vio el detector). */
  private detectedGameExe: string | null = null;
  /** Push-to-talk: ¿está pulsado el hotkey ahora mismo? */
  private micHeld = false;

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

  getAudioDevices(): AudioDeviceInfo[] {
    return this.obs.isInitialized ? this.obs.getAudioDevices() : [];
  }

  /** Push-to-talk: el hook global reporta si el hotkey está pulsado. */
  setMicHeld(held: boolean): void {
    this.micHeld = held;
    this.applyMicMute();
  }

  /** Mute efectivo del mic: apagado, o PTT activo sin la tecla pulsada. */
  private applyMicMute(): void {
    if (!this.obs.isInitialized) return;
    const s = this.getSettings();
    this.obs.setMicMuted(!s.micEnabled || (s.pttEnabled && !this.micHeld));
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
      await this.queueRebuild();
    }
    return next;
  }

  /**
   * Serializa reconstrucciones si llegan varias seguidas. El fallo de un rebuild queda en
   * el estado (error) pero NUNCA deja la cadena rechazada: una cadena envenenada saltearía
   * todos los rebuilds futuros y congelaría la captura hasta reiniciar.
   */
  private queueRebuild(): Promise<void> {
    this.applying = this.applying
      .then(() => this.rebuildPipeline())
      .catch((err) => {
        this.setStatus({ error: err instanceof Error ? err.message : String(err) });
      });
    return this.applying;
  }

  /**
   * Actualiza el juego detectado. Con bufferMode 'game' arranca/detiene el buffer;
   * una grabación manual en curso nunca se interrumpe. `executable` es el proceso real
   * que vio el detector; sin él se cae al lookup inverso (lossy) por nombre.
   */
  async setGameDetected(game: string | null, executable: string | null = null): Promise<void> {
    if (game === this.status.detectedGame) return;
    this.detectedGameExe = game ? (executable ?? gameExecutableForName(game)) : null;
    this.setStatus({ detectedGame: game });
    if (!this.obs.isInitialized) return;
    const settings = this.getSettings();
    // El audio del juego por proceso se religa en caliente (update de la fuente), sin
    // reconstruir el pipeline: un rebuild destruiría el replay buffer y su contenido.
    if (settings.audioMode === 'apps' && settings.gameAudioEnabled) {
      try {
        this.obs.updateGameAudioTarget(this.detectedGameExe);
      } catch (err) {
        this.setStatus({ error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (settings.bufferMode !== 'game') return;
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
    this.obs.buildPipeline(settings, this.env.primaryDisplay, outputDir, this.detectedGameExe);
    this.bufferRunning = false; // la reconstrucción destruye las salidas anteriores
    this.applyMicMute(); // el rebuild resetea el mute; re-aplicar el estado del PTT
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
