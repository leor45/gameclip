import { EventEmitter } from 'node:events';
import { mkdirSync } from 'node:fs';
import type {
  AudioDeviceInfo,
  CaptureSettings,
  CaptureStatus,
  EncoderInfo,
} from '@shared/capture';
import { KNOWN_GAME_PROCESSES } from '@shared/games';
import type { RunningGameMatch } from '@shared/games';
import type { ClipSource } from '@shared/library';
import { ObsCapture } from './obs';
import type { DisplayInfo } from './obs';
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
  /** Display primario: tamaño y origen en píxeles físicos (para resolver el monitor_id). */
  primaryDisplay: DisplayInfo;
  /** Display de un índice (tamaño+origen en píxeles físicos), o null si no existe. */
  displayByIndex?: (index: number) => DisplayInfo | null;
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
    screen: DisplayInfo,
    outputDir: string,
    gameExecutable: string | null,
  ): void;
  /** Religa el audio del juego (modo apps) a otro ejecutable sin reconstruir el pipeline. */
  updateGameAudioTarget(executable: string | null): void;
  /** Re-apunta el game capture de VIDEO a otro ejecutable (solo importa en modo window). */
  updateGameCaptureTarget(executable: string | null): void;
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
  /** Ejecutable del juego activo (el proceso real que vio el detector). */
  private detectedGameExe: string | null = null;
  /** Todos los juegos en ejecución (el activo es uno de ellos). */
  private runningGames: RunningGameMatch[] = [];
  /** Juego activo: el que se graba y cuyo audio se captura. */
  private activeGame: RunningGameMatch | null = null;
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

  /** Juegos en ejecución conocidos (el activo incluido). */
  getRunningGames(): RunningGameMatch[] {
    return [...this.runningGames];
  }

  /**
   * Cambia el juego activo. Sin `targetName` rota al siguiente de la lista (orden estable);
   * con él, salta a ese juego si corre y no es ya el activo. Religa el audio y, en modo auto,
   * corta y arranca una grabación nueva. Con 0/1 juegos (o un target inválido) es no-op.
   */
  async switchGame(targetName?: string): Promise<CaptureStatus> {
    // La selección se resuelve DENTRO de la tarea encolada: entre encolar y ejecutar, otro
    // cambio pudo alterar la lista o el activo.
    await this.queueTask(async () => {
      if (this.runningGames.length === 0) return;
      let next: RunningGameMatch;
      if (targetName) {
        const found = this.runningGames.find((g) => g.name === targetName);
        if (!found || found.name === this.activeGame?.name) return;
        next = found;
      } else {
        if (this.runningGames.length < 2) return;
        const idx = this.runningGames.findIndex((g) => g.name === this.activeGame?.name);
        next = this.runningGames[(idx + 1) % this.runningGames.length];
      }
      await this.applyActiveGame(next);
    });
    return this.getStatus();
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
   * Serializa operaciones que mutan el pipeline/la grabación (rebuilds y cambios de juego):
   * dos entradas concurrentes (timer del auto-switcher + hotkey, p. ej.) no deben poder leer
   * el mismo estado y duplicar stop/start de OBS. El fallo de una tarea queda en el estado
   * (error) pero NUNCA deja la cadena rechazada: una cadena envenenada saltearía todas las
   * tareas futuras y congelaría la captura hasta reiniciar.
   * OJO: solo los puntos de entrada públicos encolan; los internos llaman directo (encolar
   * desde dentro de una tarea encolada sería deadlock).
   */
  private queueTask(task: () => Promise<void>): Promise<void> {
    this.applying = this.applying.then(task).catch((err) => {
      this.setStatus({ error: err instanceof Error ? err.message : String(err) });
    });
    return this.applying;
  }

  private queueRebuild(): Promise<void> {
    return this.queueTask(() => this.rebuildPipeline());
  }

  /**
   * Reemplaza la lista de juegos en ejecución (fuente del detector multi-juego). Si el juego
   * activo dejó de correr, pasa al primero disponible (o a null); si no, lo conserva. Delega
   * en `applyActiveGame` el religado de audio, el buffer y (en modo auto) la grabación.
   */
  async setRunningGames(games: RunningGameMatch[]): Promise<void> {
    await this.queueTask(async () => {
      this.runningGames = games;
      const activeStillRunning =
        this.activeGame !== null && games.some((g) => g.name === this.activeGame!.name);
      const next = activeStillRunning
        ? games.find((g) => g.name === this.activeGame!.name)!
        : (games[0] ?? null);
      await this.applyActiveGame(next);
    });
  }

  /**
   * Compat: fija un único juego detectado (o ninguno). El camino real es `setRunningGames`;
   * sin ejecutable se cae al lookup inverso (lossy) por nombre.
   */
  async setGameDetected(game: string | null, executable: string | null = null): Promise<void> {
    if (!game) return this.setRunningGames([]);
    const exe = executable ?? gameExecutableForName(game) ?? `${game.toLowerCase()}.exe`;
    return this.setRunningGames([{ name: game, executable: exe }]);
  }

  /**
   * Aplica el juego activo: actualiza el estado, religa el audio en caliente (modo apps) y,
   * según el modo de grabación, arranca/detiene la sesión (auto) o reconcilia el buffer
   * (manual). Una grabación manual en curso nunca se interrumpe.
   */
  private async applyActiveGame(next: RunningGameMatch | null): Promise<void> {
    const prevName = this.activeGame?.name ?? null;
    const nextName = next?.name ?? null;
    const changed = nextName !== prevName;

    this.activeGame = next;
    this.detectedGameExe = next?.executable ?? null;
    if (changed) this.setStatus({ detectedGame: nextName });

    if (!this.obs.isInitialized) return;
    const settings = this.getSettings();

    // El audio del juego por proceso se religa en caliente (update de la fuente), sin
    // reconstruir el pipeline: un rebuild destruiría el replay buffer y su contenido.
    if (changed && settings.audioMode === 'apps' && settings.gameAudioEnabled) {
      try {
        this.obs.updateGameAudioTarget(this.detectedGameExe);
      } catch (err) {
        this.setStatus({ error: err instanceof Error ? err.message : String(err) });
      }
    }
    // Con captura de ventana forzada, el VIDEO también debe seguir al juego activo; si no,
    // quedaría clavado en la ventana del juego anterior.
    if (changed && settings.forceWindowCapture) {
      try {
        this.obs.updateGameCaptureTarget(this.detectedGameExe);
      } catch (err) {
        this.setStatus({ error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Modo auto: la presencia/cambio de juego dirige la grabación de sesión.
    if (settings.recordingMode === 'auto') {
      await this.applyAutoRecording(changed, prevName, nextName);
      return;
    }

    // Modos manual/off: reconciliar el buffer con el juego, sin tocar una grabación en curso.
    if (this.status.state !== 'idle' && this.status.state !== 'buffering') return;
    try {
      await this.reconcileBuffer();
      this.setStatus({ state: this.bufferRunning ? 'buffering' : 'idle', error: null });
    } catch (err) {
      this.setStatus({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  /**
   * Modo auto: arranca la grabación cuando aparece un juego (null → alguno), la corta cuando
   * la lista queda vacía (alguno → null) y la reinicia al cambiar de juego activo (stop+start,
   * un clip por sesión). Simplificación: en modo auto toda grabación se considera de sesión.
   */
  private async applyAutoRecording(
    changed: boolean,
    prevName: string | null,
    nextName: string | null,
  ): Promise<void> {
    try {
      if (changed && prevName && nextName) {
        // El clip que termina pertenece al juego anterior. Si el usuario había cortado a
        // mano (idle/buffering), el cambio de juego reanuda la sesión con el nuevo.
        if (this.status.state === 'recording') await this.stopSessionRecording(prevName);
        if (this.status.state === 'idle' || this.status.state === 'buffering') {
          await this.startSessionRecording();
        }
      } else if (nextName && !prevName) {
        await this.startSessionRecording();
      } else if (!nextName && prevName) {
        await this.stopSessionRecording(prevName);
      }
    } catch (err) {
      this.setStatus({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  /** Arranca la grabación de sesión (modo auto), asegurando antes el buffer si corresponde. */
  private async startSessionRecording(): Promise<void> {
    if (this.status.state === 'recording') return;
    // El buffer sigue disponible para el replay hotkey mientras dura la sesión.
    if (this.shouldBuffer() && !this.bufferRunning) await this.startBuffer();
    await this.obs.startRecording();
    this.setStatus({ state: 'recording', error: null });
  }

  /**
   * Corta la grabación de sesión (modo auto), guarda el clip y reconcilia el buffer.
   * `game` etiqueta el clip: al cambiar de juego, el status ya apunta al NUEVO y la
   * sesión que termina pertenece al anterior.
   */
  private async stopSessionRecording(game: string | null = this.status.detectedGame): Promise<void> {
    if (this.status.state !== 'recording') return;
    const file = await this.obs.stopRecording();
    await this.reconcileBuffer();
    this.setStatus({
      state: this.bufferRunning ? 'buffering' : 'idle',
      error: null,
      lastClipPath: file,
    });
    this.emitClipSaved(file, 'recording', game);
  }

  async startRecording(): Promise<CaptureStatus> {
    if (this.getSettings().recordingMode === 'off') return this.getStatus();
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
    if (this.getSettings().recordingMode === 'off') return this.getStatus();
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
    const s = this.getSettings();
    // Modo off: nunca se bufferiza (las salidas quedan bloqueadas aunque libobs esté vivo).
    if (s.recordingMode === 'off') return false;
    return s.bufferMode === 'always' || this.status.detectedGame !== null;
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
    // El display a grabar lo decide el índice configurado; si no se resuelve, cae al primario.
    const screen =
      this.env.displayByIndex?.(settings.screenMonitorIndex) ?? this.env.primaryDisplay;
    this.obs.buildPipeline(settings, screen, outputDir, this.detectedGameExe);
    this.bufferRunning = false; // la reconstrucción destruye las salidas anteriores
    this.applyMicMute(); // el rebuild resetea el mute; re-aplicar el estado del PTT
    if (this.shouldBuffer()) {
      await this.startBuffer();
      this.setStatus({ state: 'buffering', error: null });
    } else {
      this.setStatus({ state: 'idle', error: null });
    }
  }

  private emitClipSaved(
    filePath: string,
    source: ClipSource,
    game: string | null = this.status.detectedGame,
  ): void {
    const info: ClipSavedInfo = { filePath, source, game };
    this.emit('clip-saved', info);
  }

  private setStatus(patch: Partial<CaptureStatus>): void {
    this.status = { ...this.status, ...patch };
    this.emit('status', this.getStatus());
  }
}
