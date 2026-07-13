import { EventEmitter } from 'node:events';
import { mkdirSync } from 'node:fs';
import type {
  AudioDeviceInfo,
  CaptureProfile,
  CaptureSettings,
  CaptureStatus,
  EncoderInfo,
} from '@shared/capture';
import { captureProfile } from '@shared/capture';
import { KNOWN_GAME_PROCESSES } from '@shared/games';
import type { RunningGameMatch } from '@shared/games';
import type { ClipSource } from '@shared/library';
import { applyHapticMute, realHapticMuteDeps } from './app-audio-mute';
import type { HapticMuteOutcome } from './app-audio-mute';
import { ObsCapture } from './obs';
import type { DisplayInfo } from './obs';
import { relocateSavedFile, targetPathFor } from './relocate';
import type { SettingsStore } from './settings-store';
import { remuxAudioTrackNames } from './track-names';

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

/** Motivo visible cuando el perfil es 'none' (escritorio desactivado y sin juego detectado). */
export const NOTHING_TO_CAPTURE =
  'Sin juego detectado y con la grabación de escritorio desactivada no hay nada que capturar.';

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
  /** Re-apunta el game capture de VIDEO a la ventana de otro juego, sin reconstruir. */
  updateGameCaptureTarget(executable: string | null, settings: CaptureSettings): void;
  /** Mutea/abre el micrófono sin reconstruir el pipeline (push-to-talk). */
  setMicMuted(muted: boolean): void;
  startReplayBuffer(): Promise<void>;
  stopReplayBuffer(): Promise<void>;
  saveReplay(): Promise<string>;
  startRecording(): Promise<void>;
  stopRecording(): Promise<string>;
  /** Pistas nombradas del pipeline vigente (layout por rol), o null si no aplica el remux. */
  namedTracks(): { index: number; name: string }[] | null;
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
  /** Juego de la grabación en curso: el clip pertenece a él, no al que esté activo al cortarla. */
  private sessionGameName: string | null = null;
  /** Todos los juegos en ejecución (el activo es uno de ellos). */
  private runningGames: RunningGameMatch[] = [];
  /** Juego activo: el que se graba y cuyo audio se captura. */
  private activeGame: RunningGameMatch | null = null;
  /** Push-to-talk: ¿está pulsado el hotkey ahora mismo? */
  private micHeld = false;
  /** Perfil con el que se construyó el pipeline vigente (null: aún no hay pipeline). */
  private builtProfile: CaptureProfile | null = null;
  /** Rebuild pendiente porque el perfil cambió durante una grabación (se hace al terminarla). */
  private pendingRebuild = false;

  constructor(
    private readonly store: SettingsStore,
    private readonly env: CaptureEnvironment,
    private readonly obs: CaptureBackend = new ObsCapture(),
    private readonly ffmpegPath: string = 'ffmpeg',
    private readonly remuxFn: typeof remuxAudioTrackNames = remuxAudioTrackNames,
    private readonly hapticMute: (pattern: string) => Promise<HapticMuteOutcome> = (pattern) =>
      applyHapticMute(pattern, realHapticMuteDeps()),
  ) {
    super();
  }

  /**
   * Silencia el háptico del mando (DualSense) en la sesión de obs64.exe recién abierta. Se llama en
   * cada arranque de salida porque la sesión por-dispositivo se recrea al reabrir el stream, y es
   * fire-and-forget para no demorar el arranque de la captura. Best-effort: nunca lanza.
   */
  private reapplyHapticMute(): void {
    const s = this.getSettings();
    if (!s.hapticMuteEnabled) return;
    void this.hapticMute(s.hapticMuteDevicePattern).catch(() => undefined);
  }

  /**
   * Escribe los nombres de pista en el MP4 recién guardado (layout por rol). Best-effort: si
   * no hay pistas nombradas o el remux falla, el clip queda igual. Se hace en post-proceso
   * porque libobs no embebe los nombres en el archivo.
   */
  private async applyTrackNames(file: string): Promise<void> {
    const tracks = this.obs.namedTracks();
    if (!tracks) return;
    await this.remuxFn(this.ffmpegPath, file, tracks);
  }

  /**
   * Post-proceso de todo clip guardado: nombres de pista + reubicación en la carpeta del juego
   * (`<salida>/<Juego|Desktop>/<Nombre> <marca>.mp4`). Devuelve la ruta definitiva.
   *
   * Se hace DESPUÉS de guardar y no configurando la carpeta de libobs, porque el juego puede
   * cambiar (foco o hotkey) sin reconstruir el pipeline —y reconstruirlo vaciaría el buffer de
   * repetición—, así que la carpeta que libobs conoce puede estar vencida al guardar.
   */
  private async finishSavedClip(file: string, gameName: string | null): Promise<string> {
    await this.applyTrackNames(file);
    return relocateSavedFile(
      file,
      targetPathFor({
        outputDir: this.outputDir(),
        gameName,
        date: new Date(),
        kind: 'video',
        extension: 'mp4',
      }),
    );
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

  /** Ejecutable del juego activo (null si no hay): es su identidad interna (captura y audio). */
  activeGameExecutable(): string | null {
    return this.detectedGameExe;
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
   * Aplica el juego activo: actualiza el estado, reconstruye el pipeline si el perfil de captura
   * cambió (escritorio ↔ juego), religa el audio en caliente (modo apps) y, según el modo de
   * grabación, arranca/detiene la sesión (auto) o reconcilia el buffer (manual). Una grabación
   * en curso nunca se interrumpe: el rebuild queda pendiente hasta que termine.
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

    // Cambio de perfil (p. ej. escritorio → juego al lanzarse uno): la escena y las fuentes de
    // audio son otras, así que hay que reconstruir. Con una grabación en curso se aplaza:
    // cortar el clip a medias sería peor que grabarlo entero con el perfil anterior.
    let rebuilt = false;
    if (this.profileChanged()) {
      if (this.status.state === 'recording') {
        this.pendingRebuild = true;
      } else {
        try {
          await this.rebuildPipeline();
          rebuilt = true;
        } catch (err) {
          this.setStatus({ error: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    // Rotación DENTRO del perfil de juego (juego A → juego B): las fuentes se religan en caliente,
    // sin reconstruir — un rebuild destruiría el replay buffer y su contenido. Si acabamos de
    // reconstruir, el pipeline nuevo ya apunta al juego; y fuera del perfil de juego no hay a qué
    // apuntar: en escritorio se captura el PC entero.
    const rotacionDeJuego = changed && !rebuilt && this.builtProfile === 'game';
    if (rotacionDeJuego && settings.audioMode === 'apps' && settings.gameAudioEnabled) {
      try {
        this.obs.updateGameAudioTarget(this.detectedGameExe);
      } catch (err) {
        this.setStatus({ error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (rotacionDeJuego) {
      try {
        this.obs.updateGameCaptureTarget(this.detectedGameExe, settings);
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
    this.reapplyHapticMute();
    this.sessionGameName = this.activeGame?.name ?? null; // el juego de ESTA sesión, aunque cambie
    this.setStatus({ state: 'recording', error: null });
  }

  /**
   * Corta la grabación de sesión (modo auto), guarda el clip y reconcilia el buffer.
   * `game` etiqueta el clip: al cambiar de juego, el status ya apunta al NUEVO y la
   * sesión que termina pertenece al anterior.
   */
  private async stopSessionRecording(game: string | null = this.status.detectedGame): Promise<void> {
    if (this.status.state !== 'recording') return;
    const raw = await this.obs.stopRecording();
    // El juego es el que tenía la sesión al arrancar: al cambiar de juego, el status ya apunta al
    // nuevo pero el clip que se cierra es del anterior.
    const file = await this.finishSavedClip(raw, this.sessionGameName ?? game);
    this.sessionGameName = null;
    await this.settleAfterRecording();
    this.setStatus({
      state: this.bufferRunning ? 'buffering' : 'idle',
      error: null,
      lastClipPath: file,
    });
    this.emitClipSaved(file, 'recording', game);
  }

  /**
   * Grabar/parar/guardar replay van por la MISMA cola que los rebuilds: si no, un juego que se
   * lanza justo al pulsar grabar reconstruiría el pipeline con la salida a medio arrancar y la
   * señal 'start' de libobs no llegaría nunca (grabación muerta con "timeout esperando señal").
   * Encoladas, el rebuild ve el estado 'recording' ya asentado y se aplaza.
   */
  async startRecording(): Promise<CaptureStatus> {
    await this.queueTask(() => this.doStartRecording());
    return this.getStatus();
  }

  private async doStartRecording(): Promise<void> {
    if (this.getSettings().recordingMode === 'off') return;
    if (this.currentProfile() === 'none') {
      this.setStatus({ error: NOTHING_TO_CAPTURE });
      return;
    }
    if (this.status.state !== 'buffering' && this.status.state !== 'idle') return;
    try {
      await this.obs.startRecording();
      this.reapplyHapticMute();
      this.setStatus({ state: 'recording', error: null });
    } catch (err) {
      this.setStatus({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  async stopRecording(): Promise<CaptureStatus> {
    await this.queueTask(() => this.doStopRecording());
    return this.getStatus();
  }

  private async doStopRecording(): Promise<void> {
    if (this.status.state !== 'recording') return;
    try {
      const raw = await this.obs.stopRecording();
      const file = await this.finishSavedClip(raw, this.status.detectedGame);
      this.sessionGameName = null;
      await this.settleAfterRecording();
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
  }

  async saveReplay(): Promise<CaptureStatus> {
    await this.queueTask(() => this.doSaveReplay());
    return this.getStatus();
  }

  private async doSaveReplay(): Promise<void> {
    if (this.getSettings().recordingMode === 'off') return;
    if (this.currentProfile() === 'none') {
      this.setStatus({ error: NOTHING_TO_CAPTURE });
      return;
    }
    if (this.status.state !== 'buffering' && this.status.state !== 'recording') return;
    try {
      const raw = await this.obs.saveReplay();
      const file = await this.finishSavedClip(raw, this.status.detectedGame);
      this.setStatus({ error: null, lastClipPath: file });
      this.emitClipSaved(file, 'replay');
    } catch (err) {
      this.setStatus({ error: err instanceof Error ? err.message : String(err) });
    }
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

  /** Perfil de captura que toca ahora mismo (ajustes + juego detectado). */
  private currentProfile(): CaptureProfile {
    return captureProfile(this.getSettings(), this.detectedGameExe !== null);
  }

  /** ¿El perfil que toca difiere del que se construyó? (pipeline desactualizado) */
  private profileChanged(): boolean {
    return this.builtProfile !== null && this.builtProfile !== this.currentProfile();
  }

  /** ¿Debería estar corriendo el buffer con los ajustes y el juego actuales? */
  private shouldBuffer(): boolean {
    const s = this.getSettings();
    // Modo off: nunca se bufferiza (las salidas quedan bloqueadas aunque libobs esté vivo).
    if (s.recordingMode === 'off') return false;
    // Perfil 'none': no hay fuente de vídeo, no hay nada que bufferizar.
    if (this.currentProfile() === 'none') return false;
    return s.bufferMode === 'always' || this.status.detectedGame !== null;
  }

  private async startBuffer(): Promise<void> {
    await this.obs.startReplayBuffer();
    this.bufferRunning = true;
    this.reapplyHapticMute(); // la sesión de obs64 en el dispositivo se abre al arrancar la salida
  }

  private async stopBuffer(): Promise<void> {
    await this.obs.stopReplayBuffer();
    this.bufferRunning = false;
  }

  /**
   * Cierre de una grabación: si el perfil cambió mientras se grababa (un juego se lanzó o se
   * cerró), ahora sí se reconstruye el pipeline; si no, basta con alinear el buffer.
   */
  private async settleAfterRecording(): Promise<void> {
    if (this.pendingRebuild || this.profileChanged()) {
      await this.rebuildPipeline();
      return;
    }
    await this.reconcileBuffer();
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
    this.builtProfile = captureProfile(settings, this.detectedGameExe !== null);
    this.pendingRebuild = false;
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
