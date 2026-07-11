// Dominio de captura: ajustes, estado y validación pura (sin dependencias de Electron).

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
  /** Acelerador de Electron para guardar el clip retroactivo. */
  replayHotkey: string;
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
  /** Arrancar GameClip con Windows (minimizada a la bandeja). */
  autoLaunch: boolean;
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
  replayHotkey: 'F8',
  outputDir: '',
  storageLimitGb: 0,
  autoDeleteOldest: false,
  onlyDeleteRecordings: false,
  useRecycleBin: true,
  bufferMode: 'always',
  overlayEnabled: true,
  autoLaunch: false,
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
  return out;
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
    replayHotkey,
    outputDir: typeof raw.outputDir === 'string' ? raw.outputDir : d.outputDir,
    storageLimitGb,
    autoDeleteOldest: bool(raw.autoDeleteOldest, d.autoDeleteOldest),
    onlyDeleteRecordings: bool(raw.onlyDeleteRecordings, d.onlyDeleteRecordings),
    useRecycleBin: bool(raw.useRecycleBin, d.useRecycleBin),
    bufferMode: oneOf(raw.bufferMode, ['always', 'game'], d.bufferMode),
    overlayEnabled: bool(raw.overlayEnabled, d.overlayEnabled),
    autoLaunch: bool(raw.autoLaunch, d.autoLaunch),
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
