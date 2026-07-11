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

export interface CaptureSettings {
  resolution: OutputResolution;
  fps: 30 | 60;
  quality: RecordingQuality;
  /** Id de encoder de libobs (obs_x264, jim_nvenc, …). '' = elegir automáticamente. */
  encoderId: string;
  /** Segundos retenidos por el buffer de repetición. */
  replaySeconds: number;
  micEnabled: boolean;
  /** Acelerador de Electron para guardar el clip retroactivo. */
  replayHotkey: string;
  /** Carpeta de salida; '' = default (Videos/GameClip). */
  outputDir: string;
  bufferMode: BufferMode;
  /** Overlay in-game (indicador REC y confirmación de clip guardado). */
  overlayEnabled: boolean;
  /** Arrancar GameClip con Windows (minimizada a la bandeja). */
  autoLaunch: boolean;
}

export interface EncoderInfo {
  id: string;
  name: string;
}

export const REPLAY_SECONDS_MIN = 10;
export const REPLAY_SECONDS_MAX = 300;

export const DEFAULT_CAPTURE_SETTINGS: CaptureSettings = {
  resolution: 'native',
  fps: 60,
  quality: 'high',
  encoderId: '',
  replaySeconds: 60,
  micEnabled: true,
  replayHotkey: 'F8',
  outputDir: '',
  bufferMode: 'always',
  overlayEnabled: true,
  autoLaunch: false,
};

// Acepta un parcial de origen no confiable (disco/IPC) y devuelve settings válidos,
// cayendo al default campo a campo.
export function normalizeCaptureSettings(input: unknown): CaptureSettings {
  const d = DEFAULT_CAPTURE_SETTINGS;
  if (typeof input !== 'object' || input === null) return { ...d };
  const raw = input as Record<string, unknown>;

  const resolution = ['native', '1080p', '720p'].includes(raw.resolution as string)
    ? (raw.resolution as OutputResolution)
    : d.resolution;
  const fps = raw.fps === 30 || raw.fps === 60 ? raw.fps : d.fps;
  const quality = ['high', 'higher', 'lossless'].includes(raw.quality as string)
    ? (raw.quality as RecordingQuality)
    : d.quality;
  const encoderId = typeof raw.encoderId === 'string' ? raw.encoderId : d.encoderId;
  const replaySeconds =
    typeof raw.replaySeconds === 'number' && Number.isFinite(raw.replaySeconds)
      ? Math.min(REPLAY_SECONDS_MAX, Math.max(REPLAY_SECONDS_MIN, Math.round(raw.replaySeconds)))
      : d.replaySeconds;
  const micEnabled = typeof raw.micEnabled === 'boolean' ? raw.micEnabled : d.micEnabled;
  const replayHotkey =
    typeof raw.replayHotkey === 'string' && raw.replayHotkey.trim()
      ? raw.replayHotkey.trim()
      : d.replayHotkey;
  const outputDir = typeof raw.outputDir === 'string' ? raw.outputDir : d.outputDir;
  const bufferMode =
    raw.bufferMode === 'always' || raw.bufferMode === 'game' ? raw.bufferMode : d.bufferMode;
  const overlayEnabled =
    typeof raw.overlayEnabled === 'boolean' ? raw.overlayEnabled : d.overlayEnabled;
  const autoLaunch = typeof raw.autoLaunch === 'boolean' ? raw.autoLaunch : d.autoLaunch;

  return {
    resolution,
    fps,
    quality,
    encoderId,
    replaySeconds,
    micEnabled,
    replayHotkey,
    outputDir,
    bufferMode,
    overlayEnabled,
    autoLaunch,
  };
}
