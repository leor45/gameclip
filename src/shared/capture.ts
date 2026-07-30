// Dominio de captura: ajustes, estado y validación pura (sin dependencias de Electron).

import type { CustomGame } from './games';
import { exeKey } from './games';
import type { PerfOverlayConfig } from './perf';
import { DEFAULT_PERF_OVERLAY, normalizePerfOverlay } from './perf';

export type CaptureState = 'unavailable' | 'initializing' | 'idle' | 'buffering' | 'recording';

export interface CaptureStatus {
  state: CaptureState;
  error: string | null;
  /** Ruta del último clip guardado (replay o grabación), si hay. */
  lastClipPath: string | null;
  /** Nombre del juego en ejecución detectado, si hay. */
  detectedGame: string | null;
}

/** 'always': buffer siempre activo · 'game': solo mientras hay un juego detectado. */
export type BufferMode = 'always' | 'game';

export type OutputResolution = 'native' | '1080p' | '720p';
export type RecordingQuality = 'high' | 'higher' | 'lossless';
export type CaptureFps = 24 | 30 | 60 | 120 | 144;
/** 'desktop': todo el audio del escritorio · 'apps': solo las apps elegidas (+ juego). */
export type AudioMode = 'desktop' | 'apps';
/** Pistas de una captura de escritorio: todo mezclado, o PC y micrófono por separado. */
export type DesktopAudioTracks = 'mixed' | 'separate';
/**
 * Perfil de captura: qué se está grabando ahora mismo. Lo derivan los ajustes + la detección de
 * juego, y de él salen la fuente de vídeo y las fuentes de audio.
 * - 'game': solo el juego (game capture; el audio respeta los ajustes del usuario).
 * - 'desktop': el monitor elegido, con TODO el audio del PC.
 * - 'none': nada que capturar (escritorio desactivado y sin juego).
 */
export type CaptureProfile = 'game' | 'desktop' | 'none';
/** Buffer de repetición. Hoy libobs siempre bufferiza en RAM; 'disk' queda preparado. */
export type RecordingBufferKind = 'disk' | 'memory';
/** 'game': ratio del monitor · resto: salida 16:9 (estirada, con barras o recortada). */
export type AspectRatioMode = 'game' | 'stretch169' | 'bars169' | 'crop169';

/** App capturada en modo 'apps'. */
export interface AudioAppCapture {
  /** Nombre del ejecutable (p. ej. Discord.exe). */
  executable: string;
  /** Volumen 0–100. */
  volume: number;
  /** Capturarla o no, sin quitarla de la lista. */
  enabled: boolean;
}

/** Apps fijas de la lista en modo 'apps': siempre visibles aunque no estén corriendo. */
export const DEFAULT_AUDIO_APPS: readonly string[] = ['Discord.exe'];

/** Teclas/botones aceptados para push-to-talk (nombres de UiohookKey + botones del mouse). */
export const PTT_HOTKEY_OPTIONS: readonly string[] = [
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  'Ctrl', 'Alt', 'Shift', 'Space', 'CapsLock', 'Tab',
  'Mouse4', 'Mouse5',
];

/** 'manual': hotkeys · 'auto': graba la sesión entera del juego · 'off': sin grabación. */
export type RecordingMode = 'manual' | 'auto' | 'off';

/** Display disponible para grabación de escritorio (preview para el modal). */
export interface DisplayInfo {
  /** Índice del monitor (orden de screen.getAllDisplays; 0 suele ser el primario). */
  index: number;
  label: string;
  width: number;
  height: number;
  primary: boolean;
  /** Preview JPEG/PNG como data URL, para el modal de elección. */
  thumbnailDataUrl: string;
}

/** Micrófono del sistema enumerado vía libobs. */
export interface AudioDeviceInfo {
  /** Endpoint WASAPI que entiende libobs; 'default' = dispositivo por defecto. */
  id: string;
  name: string;
}

/** Proceso candidato a captura de audio por app. */
export interface AudioAppInfo {
  executable: string;
  /** Título de la ventana principal, para mostrar en la UI. */
  windowTitle: string;
}

export interface CaptureSettings {
  resolution: OutputResolution;
  fps: CaptureFps;
  quality: RecordingQuality;
  /** Bitrate en Mbps (3–100). 0 = automático (presets de `quality`). */
  bitrateMbps: number;
  /** Id de encoder de libobs (obs_x264, jim_nvenc, …). '' = elegir automáticamente. */
  encoderId: string;
  /** Segundos retenidos por el buffer de repetición. */
  replaySeconds: number;
  micEnabled: boolean;
  /** Endpoint WASAPI del micrófono; '' = dispositivo por defecto. */
  micDeviceId: string;
  /** Volumen del micrófono 0–100. */
  micVolume: number;
  /** Push-to-talk: el mic solo se abre mientras el hotkey está pulsado. */
  pttEnabled: boolean;
  /** Tecla/botón de push-to-talk (PTT_HOTKEY_OPTIONS). */
  pttHotkey: string;
  /** Filtro RNNoise de libobs sobre el micrófono. */
  noiseSuppressionEnabled: boolean;
  audioMode: AudioMode;
  /** Volumen del audio del escritorio 0–100 (modo 'desktop'). */
  desktopAudioVolume: number;
  /** Modo 'apps': capturar el audio del juego detectado. */
  gameAudioEnabled: boolean;
  /** Volumen del audio del juego 0–100 (modo 'apps'). */
  gameAudioVolume: number;
  /** Modo 'apps': apps adicionales a capturar. */
  audioApps: AudioAppCapture[];
  /** Guardar cada fuente de audio en una pista separada del MP4. */
  separateAudioTracks: boolean;
  /**
   * Silenciar la sesión de audio de obs64.exe en el dispositivo del mando (DualSense) en cada
   * arranque de captura, para que la vibración háptica —que el DualSense transporta como audio— no
   * se cuele en el clip. Ver spec/work/feature-silenciar-haptico-dualsense.
   */
  hapticMuteEnabled: boolean;
  /** Patrón de nombre del dispositivo a silenciar (substring, case-insensitive). */
  hapticMuteDevicePattern: string;
  /**
   * Botón de captura del mando (Share/Create): usar el botón dedicado del DualSense o del mando de
   * Xbox para guardar un clip (equivalente a `replayHotkey`). DualSense por HID; Xbox por GameInput.
   * Ver spec/work/feature-boton-captura-mandos.
   */
  controllerCaptureEnabled: boolean;
  /** Acelerador de Electron para guardar el clip retroactivo. */
  replayHotkey: string;
  /** Acelerador de Electron que arranca y corta la grabación normal (la larga). */
  recordingHotkey: string;
  recordingMode: RecordingMode;
  /** Hotkey global para rotar el juego activo entre los juegos en ejecución. */
  gameSwitchEnabled: boolean;
  gameSwitchHotkey: string;
  /** Cambiar solo al juego cuya ventana quede en primer plano ~20 s. */
  autoGameSwitching: boolean;
  screenshotsEnabled: boolean;
  screenshotHotkey: string;
  /**
   * Monitor de las capturas de pantalla, **independiente del de grabación**:
   * `SCREENSHOT_MONITOR_PRIMARY` (-1) = seguir al monitor principal de Windows. Separado de
   * `screenMonitorIndex` porque el modal «Grabar escritorio…» persiste ese índice, y las capturas
   * pueden estar activas con la grabación apagada. Ver spec/work/feature-screenshots-monitor-y-hdr.
   */
  screenshotMonitorIndex: number;
  /**
   * Capturas de pantalla en monitores HDR. Con HDR activo, DXGI entrega el monitor en 10 bits y
   * Chromium lo **saca de la lista de fuentes**: sin esto no hay captura posible de ese monitor —no
   * es que salga saturada, es que no existe—. Usa el capturador GDI
   * (`--disable-features=DirectXCapturer`), que entrega la composición SDR ya tonemapeada por
   * Windows. **Encendida por defecto**; la casilla de Avanzado es el escape, no el interruptor de
   * la feature. Es un switch de Chromium: solo se aplica al arrancar el proceso, así que cambiarlo
   * relanza la app (a diferencia de `hdrCompatibility`, que es de libobs y va en caliente).
   */
  screenshotHdrCompatibility: boolean;
  /** Juegos añadidos a mano (la detección los trata como conocidos), con nombre opcional. */
  customGames: CustomGame[];
  /** Monitor a grabar (índice de display; 0 = primario). */
  screenMonitorIndex: number;
  /** Grabar el escritorio cuando no hay juego. Apagado: sin juego no se captura nada. */
  desktopRecordingEnabled: boolean;
  /** Grabando escritorio: al lanzarse un juego, capturar solo el juego. */
  desktopAutoSwitchToGame: boolean;
  /** Pistas de audio de una captura de escritorio (el audio siempre es el del PC entero). */
  desktopAudioTracks: DesktopAudioTracks;
  /** Carpeta de salida; '' = default (Videos/GameClip). */
  outputDir: string;
  /** Límite de almacenamiento de clips en GB; 0 = sin límite. */
  storageLimitGb: number;
  /** Al superar el límite, borrar automáticamente los archivos más viejos. */
  autoDeleteOldest: boolean;
  /** Auto-borrado: solo grabaciones largas (nunca clips de replay). */
  onlyDeleteRecordings: boolean;
  /** Enviar lo borrado a la papelera de reciclaje en vez de borrado definitivo. */
  useRecycleBin: boolean;
  bufferMode: BufferMode;
  /** Overlay in-game (indicador REC y confirmación de clip guardado). */
  overlayEnabled: boolean;
  /** Overlay de rendimiento (FPS, GPU, CPU…). Ver spec/work/feature-overlay-rendimiento. */
  perfOverlayEnabled: boolean;
  /** Estado de vista del overlay activo; la acción configurable de atajo lo alterna. */
  perfOverlayVisible: boolean;
  /** Atajo global que muestra/oculta el overlay de rendimiento (no cambia su configuración). */
  perfOverlayHotkey: string;
  /** Métricas marcadas, posición, disposición, color y opacidad del overlay de rendimiento. */
  perfOverlay: PerfOverlayConfig;
  /** Arrancar GameClip con Windows (minimizada a la bandeja). */
  autoLaunch: boolean;
  /**
   * Auto-inicio con privilegios de administrador vía tarea programada (una confirmación UAC al
   * activarlo). Sin admin, los FPS (ETW) y la temperatura de CPU (driver ring0) no están
   * disponibles; ver el plan de feature-overlay-rendimiento.
   */
  autoLaunchElevated: boolean;
  /** Captura de monitor vía Windows Graphics Capture (ventanas fuera de foco). */
  advancedWindowCapture: boolean;
  /** Captura experimental (incluye overlays de terceros en el game capture). */
  experimentalCapture: boolean;
  /** Monitor HDR: conversión HDR → SDR en el game capture. */
  hdrCompatibility: boolean;
  /** Forzar game capture en modo ventana (solo si lo pide soporte). */
  forceWindowCapture: boolean;
  showMouseCursor: boolean;
  recordingBuffer: RecordingBufferKind;
  aspectRatio: AspectRatioMode;
  /** Aceleración por hardware de la app (aplicada antes de ready; requiere reinicio). */
  hardwareAcceleration: boolean;
}

export interface EncoderInfo {
  id: string;
  name: string;
}

export const REPLAY_SECONDS_MIN = 10;
export const REPLAY_SECONDS_MAX = 300;
export const BITRATE_MBPS_MIN = 3;
export const BITRATE_MBPS_MAX = 100;
export const STORAGE_LIMIT_GB_MAX = 2000;
export const AUDIO_APPS_MAX = 8;
// Máximo de apps con captura de audio simultánea (modo 'apps'): libobs soporta 6 pistas y
// tres están fijas (1 mezcla, 2 juego, 3 mic), así que quedan 3 pistas para apps.
export const AUDIO_APPS_TRACK_MAX = 3;
export const CUSTOM_GAMES_MAX = 50;
export const SCREEN_MONITOR_INDEX_MAX = 7;
/** `screenshotMonitorIndex`: seguir al monitor principal de Windows en vez de fijar un índice. */
export const SCREENSHOT_MONITOR_PRIMARY = -1;
export const CAPTURE_FPS_VALUES: readonly CaptureFps[] = [24, 30, 60, 120, 144];

export const DEFAULT_CAPTURE_SETTINGS: CaptureSettings = {
  resolution: 'native',
  fps: 60,
  quality: 'high',
  bitrateMbps: 0,
  encoderId: '',
  replaySeconds: 60,
  micEnabled: true,
  micDeviceId: '',
  micVolume: 100,
  pttEnabled: false,
  pttHotkey: 'F9',
  noiseSuppressionEnabled: false,
  audioMode: 'desktop',
  desktopAudioVolume: 100,
  gameAudioEnabled: true,
  gameAudioVolume: 100,
  audioApps: [],
  separateAudioTracks: false,
  hapticMuteEnabled: false,
  hapticMuteDevicePattern: 'DualSense',
  controllerCaptureEnabled: false,
  replayHotkey: 'F8',
  recordingHotkey: 'F7',
  recordingMode: 'manual',
  gameSwitchEnabled: true,
  gameSwitchHotkey: 'F10',
  autoGameSwitching: true,
  screenshotsEnabled: true,
  screenshotHotkey: 'F6',
  screenshotMonitorIndex: SCREENSHOT_MONITOR_PRIMARY,
  // Encendida por defecto: con HDR activo el monitor NO sale mal, sale ausente de getSources(), así
  // que sin esto la captura de un monitor HDR es imposible y la app vendría rota de fábrica.
  screenshotHdrCompatibility: true,
  customGames: [],
  screenMonitorIndex: 0,
  desktopRecordingEnabled: true,
  desktopAutoSwitchToGame: true,
  desktopAudioTracks: 'mixed',
  outputDir: '',
  storageLimitGb: 0,
  autoDeleteOldest: false,
  onlyDeleteRecordings: false,
  useRecycleBin: true,
  bufferMode: 'always',
  overlayEnabled: true,
  perfOverlayEnabled: false,
  perfOverlayVisible: true,
  perfOverlayHotkey: 'Alt+R',
  perfOverlay: DEFAULT_PERF_OVERLAY,
  autoLaunch: false,
  autoLaunchElevated: false,
  advancedWindowCapture: false,
  experimentalCapture: false,
  hdrCompatibility: false,
  forceWindowCapture: false,
  showMouseCursor: false,
  recordingBuffer: 'memory',
  aspectRatio: 'game',
  hardwareAcceleration: true,
};

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

/** Volumen 0–100, entero. */
function volume(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Juegos manuales: sin vacíos ni duplicados (por ejecutable, case-insensitive). Acepta la forma
 * vieja —un array de strings— y la migra a `{ executable }` sin nombre, que se comporta igual que
 * antes: los juegos ya dados de alta sobreviven a la actualización.
 */
function normalizeCustomGames(value: unknown): CustomGame[] {
  if (!Array.isArray(value)) return [];
  const out: CustomGame[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const raw =
      typeof item === 'string'
        ? { executable: item }
        : typeof item === 'object' && item !== null
          ? (item as Record<string, unknown>)
          : null;
    if (!raw || typeof raw.executable !== 'string') continue;

    const executable = raw.executable.trim();
    const key = exeKey(executable);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    out.push(name ? { executable, name } : { executable });
    if (out.length >= CUSTOM_GAMES_MAX) break;
  }
  return out;
}

/** ¿El ejecutable es una de las apps fijas (Discord)? Case-insensitive. */
function esAppFija(executable: string): boolean {
  return DEFAULT_AUDIO_APPS.some((d) => d.toLowerCase() === executable.toLowerCase());
}

/**
 * Ejecutables de las apps activas en el ORDEN de pista: las fijas (Discord) primero y luego
 * las de usuario en su orden de lista. Es el orden que ve el usuario en los ajustes y con el
 * que se asignan las pistas T4+.
 */
export function orderedActiveAudioApps(apps: AudioAppCapture[]): string[] {
  const activas = apps.filter((a) => a.enabled);
  const fijas = activas.filter((a) => esAppFija(a.executable));
  const usuario = activas.filter((a) => !esAppFija(a.executable));
  return [...fijas, ...usuario].map((a) => a.executable);
}

/**
 * Desmarca (sin borrar) las apps activas que exceden `AUDIO_APPS_TRACK_MAX`, en el orden de
 * pista. Las primeras 3 activas conservan su captura; el resto queda `enabled: false` en la
 * lista para poder reactivarlas si se desactiva otra.
 */
function capActiveAudioApps(apps: AudioAppCapture[]): AudioAppCapture[] {
  const ordenadas = orderedActiveAudioApps(apps);
  if (ordenadas.length <= AUDIO_APPS_TRACK_MAX) return apps;
  const permitidas = new Set(
    ordenadas.slice(0, AUDIO_APPS_TRACK_MAX).map((e) => e.toLowerCase()),
  );
  return apps.map((a) =>
    a.enabled && !permitidas.has(a.executable.toLowerCase()) ? { ...a, enabled: false } : a,
  );
}

function normalizeAudioApps(value: unknown): AudioAppCapture[] {
  if (!Array.isArray(value)) return [];
  const out: AudioAppCapture[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const raw = item as Record<string, unknown>;
    if (typeof raw.executable !== 'string') continue;
    const executable = raw.executable.trim();
    if (!executable) continue;
    const key = executable.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // `enabled` default true: migra las listas guardadas antes de existir el campo.
    out.push({
      executable,
      volume: volume(raw.volume, 100),
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
    });
    if (out.length >= AUDIO_APPS_MAX) break;
  }
  return capActiveAudioApps(out);
}

/**
 * Perfil de captura a partir de los ajustes y de si hay un juego detectado.
 *
 * - Sin grabación de escritorio: se captura el juego, y sin juego no se captura nada.
 * - Con grabación de escritorio: el auto-switch decide si un juego detectado toma el control;
 *   desmarcado, se sigue grabando el monitor aunque haya un juego corriendo.
 */
export function captureProfile(settings: CaptureSettings, gameDetected: boolean): CaptureProfile {
  if (!settings.desktopRecordingEnabled) return gameDetected ? 'game' : 'none';
  if (gameDetected && settings.desktopAutoSwitchToGame) return 'game';
  return 'desktop';
}

/**
 * ¿Hay que ocultar el overlay de rendimiento de **toda** captura (`WDA_EXCLUDEFROMCAPTURE`)?
 *
 * Solo cuando el pipeline está capturando **el monitor**, que es lo único que puede llevárselo
 * dentro. Con perfil `game` la fuente es `game_capture`, que solo ve la swapchain del juego y **no
 * puede** ver una ventana ajena: ahí el clip sale limpio sin protección, y el overlay pasa a verse al
 * compartir pantalla o en un recorte de Windows — que es el objetivo de la feature.
 *
 * El segundo término importa tanto como el primero: **no** basta con «el usuario pulsó grabar». El
 * búfer de repetición corre en continuo, así que estando en el escritorio con el búfer activo hay que
 * proteger igual; si no, el overlay entraría en el búfer y aparecería en cualquier clip que se
 * guardara después.
 */
export function needsContentProtection(profile: CaptureProfile, capturing: boolean): boolean {
  return profile === 'desktop' && capturing;
}

// Acepta un parcial de origen no confiable (disco/IPC) y devuelve settings válidos,
// cayendo al default campo a campo.
export function normalizeCaptureSettings(input: unknown): CaptureSettings {
  const d = DEFAULT_CAPTURE_SETTINGS;
  if (typeof input !== 'object' || input === null) return { ...d };
  const raw = input as Record<string, unknown>;

  const fps = CAPTURE_FPS_VALUES.includes(raw.fps as CaptureFps)
    ? (raw.fps as CaptureFps)
    : d.fps;
  const bitrateMbps =
    typeof raw.bitrateMbps === 'number' && Number.isFinite(raw.bitrateMbps) && raw.bitrateMbps > 0
      ? Math.min(BITRATE_MBPS_MAX, Math.max(BITRATE_MBPS_MIN, Math.round(raw.bitrateMbps)))
      : d.bitrateMbps;
  const replaySeconds =
    typeof raw.replaySeconds === 'number' && Number.isFinite(raw.replaySeconds)
      ? Math.min(REPLAY_SECONDS_MAX, Math.max(REPLAY_SECONDS_MIN, Math.round(raw.replaySeconds)))
      : d.replaySeconds;
  const storageLimitGb =
    typeof raw.storageLimitGb === 'number' && Number.isFinite(raw.storageLimitGb)
      ? Math.min(STORAGE_LIMIT_GB_MAX, Math.max(0, Math.round(raw.storageLimitGb)))
      : d.storageLimitGb;
  const replayHotkey =
    typeof raw.replayHotkey === 'string' && raw.replayHotkey.trim()
      ? raw.replayHotkey.trim()
      : d.replayHotkey;
  const recordingHotkey =
    typeof raw.recordingHotkey === 'string' && raw.recordingHotkey.trim()
      ? raw.recordingHotkey.trim()
      : d.recordingHotkey;
  const gameSwitchHotkey =
    typeof raw.gameSwitchHotkey === 'string' && raw.gameSwitchHotkey.trim()
      ? raw.gameSwitchHotkey.trim()
      : d.gameSwitchHotkey;
  const screenshotHotkey =
    typeof raw.screenshotHotkey === 'string' && raw.screenshotHotkey.trim()
      ? raw.screenshotHotkey.trim()
      : d.screenshotHotkey;
  const screenMonitorIndex =
    typeof raw.screenMonitorIndex === 'number' &&
    Number.isInteger(raw.screenMonitorIndex) &&
    raw.screenMonitorIndex >= 0 &&
    raw.screenMonitorIndex <= SCREEN_MONITOR_INDEX_MAX
      ? raw.screenMonitorIndex
      : d.screenMonitorIndex;
  // Acepta el sentinela -1 (seguir al principal) además de los índices reales.
  const screenshotMonitorIndex =
    typeof raw.screenshotMonitorIndex === 'number' &&
    Number.isInteger(raw.screenshotMonitorIndex) &&
    raw.screenshotMonitorIndex >= SCREENSHOT_MONITOR_PRIMARY &&
    raw.screenshotMonitorIndex <= SCREEN_MONITOR_INDEX_MAX
      ? raw.screenshotMonitorIndex
      : d.screenshotMonitorIndex;

  return {
    resolution: oneOf(raw.resolution, ['native', '1080p', '720p'], d.resolution),
    fps,
    quality: oneOf(raw.quality, ['high', 'higher', 'lossless'], d.quality),
    bitrateMbps,
    encoderId: typeof raw.encoderId === 'string' ? raw.encoderId : d.encoderId,
    replaySeconds,
    micEnabled: bool(raw.micEnabled, d.micEnabled),
    micDeviceId: typeof raw.micDeviceId === 'string' ? raw.micDeviceId : d.micDeviceId,
    micVolume: volume(raw.micVolume, d.micVolume),
    pttEnabled: bool(raw.pttEnabled, d.pttEnabled),
    pttHotkey: PTT_HOTKEY_OPTIONS.includes(raw.pttHotkey as string)
      ? (raw.pttHotkey as string)
      : d.pttHotkey,
    noiseSuppressionEnabled: bool(raw.noiseSuppressionEnabled, d.noiseSuppressionEnabled),
    audioMode: oneOf(raw.audioMode, ['desktop', 'apps'], d.audioMode),
    desktopAudioVolume: volume(raw.desktopAudioVolume, d.desktopAudioVolume),
    gameAudioEnabled: bool(raw.gameAudioEnabled, d.gameAudioEnabled),
    gameAudioVolume: volume(raw.gameAudioVolume, d.gameAudioVolume),
    audioApps: normalizeAudioApps(raw.audioApps),
    separateAudioTracks: bool(raw.separateAudioTracks, d.separateAudioTracks),
    hapticMuteEnabled: bool(raw.hapticMuteEnabled, d.hapticMuteEnabled),
    hapticMuteDevicePattern:
      typeof raw.hapticMuteDevicePattern === 'string' && raw.hapticMuteDevicePattern.trim()
        ? raw.hapticMuteDevicePattern.trim()
        : d.hapticMuteDevicePattern,
    controllerCaptureEnabled: bool(raw.controllerCaptureEnabled, d.controllerCaptureEnabled),
    replayHotkey,
    recordingHotkey,
    recordingMode: oneOf(raw.recordingMode, ['manual', 'auto', 'off'], d.recordingMode),
    gameSwitchEnabled: bool(raw.gameSwitchEnabled, d.gameSwitchEnabled),
    gameSwitchHotkey,
    autoGameSwitching: bool(raw.autoGameSwitching, d.autoGameSwitching),
    screenshotsEnabled: bool(raw.screenshotsEnabled, d.screenshotsEnabled),
    screenshotHotkey,
    screenshotMonitorIndex,
    screenshotHdrCompatibility: bool(raw.screenshotHdrCompatibility, d.screenshotHdrCompatibility),
    customGames: normalizeCustomGames(raw.customGames),
    screenMonitorIndex,
    desktopRecordingEnabled: bool(raw.desktopRecordingEnabled, d.desktopRecordingEnabled),
    desktopAutoSwitchToGame: bool(raw.desktopAutoSwitchToGame, d.desktopAutoSwitchToGame),
    desktopAudioTracks: oneOf(raw.desktopAudioTracks, ['mixed', 'separate'], d.desktopAudioTracks),
    outputDir: typeof raw.outputDir === 'string' ? raw.outputDir : d.outputDir,
    storageLimitGb,
    autoDeleteOldest: bool(raw.autoDeleteOldest, d.autoDeleteOldest),
    onlyDeleteRecordings: bool(raw.onlyDeleteRecordings, d.onlyDeleteRecordings),
    useRecycleBin: bool(raw.useRecycleBin, d.useRecycleBin),
    bufferMode: oneOf(raw.bufferMode, ['always', 'game'], d.bufferMode),
    overlayEnabled: bool(raw.overlayEnabled, d.overlayEnabled),
    perfOverlayEnabled: bool(raw.perfOverlayEnabled, d.perfOverlayEnabled),
    perfOverlayVisible: bool(raw.perfOverlayVisible, d.perfOverlayVisible),
    perfOverlayHotkey:
      typeof raw.perfOverlayHotkey === 'string' && raw.perfOverlayHotkey.trim()
        ? raw.perfOverlayHotkey.trim()
        : d.perfOverlayHotkey,
    perfOverlay: normalizePerfOverlay(raw.perfOverlay),
    autoLaunch: bool(raw.autoLaunch, d.autoLaunch),
    autoLaunchElevated: bool(raw.autoLaunchElevated, d.autoLaunchElevated),
    advancedWindowCapture: bool(raw.advancedWindowCapture, d.advancedWindowCapture),
    experimentalCapture: bool(raw.experimentalCapture, d.experimentalCapture),
    hdrCompatibility: bool(raw.hdrCompatibility, d.hdrCompatibility),
    forceWindowCapture: bool(raw.forceWindowCapture, d.forceWindowCapture),
    showMouseCursor: bool(raw.showMouseCursor, d.showMouseCursor),
    recordingBuffer: oneOf(raw.recordingBuffer, ['disk', 'memory'], d.recordingBuffer),
    aspectRatio: oneOf(
      raw.aspectRatio,
      ['game', 'stretch169', 'bars169', 'crop169'],
      d.aspectRatio,
    ),
    hardwareAcceleration: bool(raw.hardwareAcceleration, d.hardwareAcceleration),
  };
}
