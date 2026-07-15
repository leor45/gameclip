// Dominio de las pistas de audio de un clip: tipos y lógica pura (sin Electron ni ffmpeg).
//
// Los clips grabados en modo apps con pistas separadas llevan un layout por rol (ver
// `audioTrackLayout` en la captura): la pista 1 es la mezcla `default` y las siguientes son las
// fuentes aisladas (`game`, `mic`, `<app>`). Sobre ese layout el editor puede mutear pistas: la
// mezcla se reconstruye desde las fuentes, que nunca se borran del archivo.

/** Pista de audio de un clip, tal como la ve ffmpeg. */
export interface ClipAudioTrack {
  /** Ordinal de audio dentro del archivo: el `N` de `-map 0:a:N`. */
  index: number;
  /** Nombre embebido en el MP4; null si la pista no tiene nombre. */
  name: string | null;
}

/** Onda (espectro) de una pista para la UI: picos normalizados 0..1, indexados por `trackKey`. */
export interface TrackWaveform {
  key: string;
  peaks: number[];
}

/** Nombre de la pista que lleva la mezcla completa (la única que oyen los reproductores). */
export const DEFAULT_TRACK_NAME = 'default';

/** Etiqueta de una pista sin nombre (clips de modo escritorio o anteriores al layout por rol). */
export const UNNAMED_TRACK_LABEL = 'Audio';

export interface SaveAudioEditRequest {
  clipId: number;
  /** Claves (`trackKey`) de las pistas que quedan muteadas en la mezcla. */
  mutedTracks: string[];
}

export interface SaveAudioEditResult {
  status: 'done' | 'error';
  message?: string;
}

/**
 * ¿El clip tiene layout por rol? Solo entonces la mezcla se puede reconstruir: hace falta que la
 * pista 1 sea `default` y que haya al menos una fuente aislada y nombrada detrás.
 */
export function hasRoleTracks(tracks: ClipAudioTrack[]): boolean {
  return (
    tracks[0]?.name === DEFAULT_TRACK_NAME && tracks.slice(1).some((t) => Boolean(t.name?.trim()))
  );
}

/**
 * Pistas que el usuario marca o desmarca. Con layout por rol son las fuentes (la mezcla `default`
 * es derivada, no una fuente). Sin layout por rol solo hay una pista: la propia mezcla.
 */
export function selectableTracks(tracks: ClipAudioTrack[]): ClipAudioTrack[] {
  if (hasRoleTracks(tracks)) return tracks.slice(1).filter((t) => Boolean(t.name?.trim()));
  return tracks.slice(0, 1);
}

/** Clave estable de una pista, para persistir la selección y para la UI. */
export function trackKey(track: ClipAudioTrack): string {
  return track.name?.trim() || `pista-${track.index}`;
}

/** Nombre visible de una pista. */
export function trackLabel(track: ClipAudioTrack): string {
  return track.name?.trim() || UNNAMED_TRACK_LABEL;
}

/** Pistas marcadas (las seleccionables que no están muteadas), en el orden del archivo. */
export function activeTracks(tracks: ClipAudioTrack[], muted: string[]): ClipAudioTrack[] {
  const silenciadas = new Set(muted);
  return selectableTracks(tracks).filter((t) => !silenciadas.has(trackKey(t)));
}

/** Ordinales (`-map 0:a:N`) de las pistas marcadas. */
export function activeTrackIndexes(tracks: ClipAudioTrack[], muted: string[]): number[] {
  return activeTracks(tracks, muted).map((t) => t.index);
}

/**
 * Volumen (ganancia lineal) por pista: clave de `trackKey` → ganancia `0..MAX_TRACK_GAIN`, donde
 * `1` = 100 % (sin tocar). Ausencia de una clave ⇒ 1. Muteada ≡ 0. Lo usa el editor avanzado; el
 * editor simple sigue con `mutedTracks` intacto.
 */
export type TrackVolumes = Record<string, number>;

/** Ganancia máxima por pista (200 %). `volume` de ffmpeg es lineal: 2 = ×2. */
export const MAX_TRACK_GAIN = 2;

/** Ganancia por defecto de una pista sin ajuste: 100 % (no la toca). */
export const DEFAULT_TRACK_GAIN = 1;

/** Acota la ganancia al rango permitido `[0, MAX_TRACK_GAIN]`. */
export function clampTrackGain(gain: number): number {
  if (!Number.isFinite(gain)) return DEFAULT_TRACK_GAIN;
  return Math.min(MAX_TRACK_GAIN, Math.max(0, gain));
}

/** Ganancia de una pista: la guardada (acotada), o 1 (100 %) si no tiene ajuste. */
export function trackGain(volumes: TrackVolumes, key: string): number {
  const g = volumes[key];
  return typeof g === 'number' && Number.isFinite(g) ? clampTrackGain(g) : DEFAULT_TRACK_GAIN;
}

/** Ordinal (`0:a:N`) + ganancia de cada pista seleccionable, en el orden del archivo. */
export interface TrackGain {
  index: number;
  gain: number;
}

/** Pistas seleccionables con su ganancia. Base del render con volúmenes del editor avanzado. */
export function selectableTrackGains(
  tracks: ClipAudioTrack[],
  volumes: TrackVolumes,
): TrackGain[] {
  return selectableTracks(tracks).map((t) => ({
    index: t.index,
    gain: trackGain(volumes, trackKey(t)),
  }));
}

/** Volúmenes de origen no confiable (IPC/DB): claves string no vacías, ganancias finitas y acotadas. */
export function normalizeTrackVolumes(input: unknown): TrackVolumes {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return {};
  const out: TrackVolumes = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const key = k.trim();
    if (!key) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    out[key] = clampTrackGain(v);
  }
  return out;
}

/** Compat: una selección de pistas muteadas se proyecta como volumen 0 (equivalencia mute ↔ 0 %). */
export function mutedToVolumes(muted: string[]): TrackVolumes {
  const out: TrackVolumes = {};
  for (const key of normalizeMutedTracks(muted)) out[key] = 0;
  return out;
}

/** Lista de claves muteadas de origen no confiable (IPC o columna de la DB). */
export function normalizeMutedTracks(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const item of input) {
    if (typeof item !== 'string') continue;
    const clean = item.trim();
    if (clean && !out.includes(clean)) out.push(clean);
  }
  return out;
}

/** Valida un pedido de guardar edit venido del renderer. */
export function normalizeSaveAudioEditRequest(input: unknown): SaveAudioEditRequest {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Pedido de edición de audio inválido.');
  }
  const raw = input as Record<string, unknown>;
  const clipId = raw.clipId;
  if (typeof clipId !== 'number' || !Number.isInteger(clipId) || clipId <= 0) {
    throw new Error('Id de clip inválido.');
  }
  return { clipId, mutedTracks: normalizeMutedTracks(raw.mutedTracks) };
}
