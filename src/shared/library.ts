// Dominio de la biblioteca de clips: tipos y validación pura (sin Electron ni SQLite).

export type ClipSource = 'replay' | 'recording' | 'scan';

/**
 * Qué ES el archivo, que no es lo mismo que de dónde salió (`ClipSource`): un PNG es una imagen
 * tanto si lo guardó la hotkey como si lo encontró el escaneo. Se deriva de la extensión.
 */
export type MediaKind = 'video' | 'image';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

/** `…/Terraria Screenshot 2026.png` → `image`; cualquier otra cosa → `video`. */
export function mediaKindForFile(filePath: string): MediaKind {
  const punto = filePath.lastIndexOf('.');
  const ext = punto === -1 ? '' : filePath.slice(punto).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext) ? 'image' : 'video';
}

export interface Clip {
  id: number;
  /** Ruta absoluta del archivo (video o captura). */
  filePath: string;
  /** Nombre visible, editable por el usuario. */
  title: string;
  /** Juego/ventana detectada al guardar; null si no se pudo. */
  game: string | null;
  /** Duración en segundos; null hasta que el renderer la calcula. */
  durationSeconds: number | null;
  sizeBytes: number;
  favorite: boolean;
  tags: string[];
  /** Ruta del thumbnail JPEG; null hasta generarse. */
  thumbnailPath: string | null;
  /** ISO 8601. */
  createdAt: string;
  source: ClipSource;
  /** Video o captura de pantalla. Lo consulta la UI para decidir qué pintar y qué acciones ofrecer. */
  kind: MediaKind;
  /** Pistas de audio muteadas en la mezcla del clip (claves de `trackKey`); ver `@shared/tracks`. */
  mutedTracks: string[];
}

/** Campos editables por el usuario desde la UI. */
export interface ClipPatch {
  title?: string;
  game?: string | null;
  favorite?: boolean;
  tags?: string[];
}

/** Uso de disco de la carpeta de clips y su unidad. */
export interface StorageStats {
  /** Bytes de clips de replay + escaneados en el catálogo. */
  clipsBytes: number;
  /** Bytes de grabaciones manuales (source 'recording'). */
  recordingsBytes: number;
  /** Bytes de las capturas de pantalla. Ocupan (cuentan para el límite) pero no se auto-borran. */
  screenshotsBytes: number;
  driveFreeBytes: number;
  driveTotalBytes: number;
}

export interface ClipsQuery {
  /** Texto libre: matchea título, juego y tags (case-insensitive). */
  search?: string;
  favoritesOnly?: boolean;
  /** Filtra por juego exacto. */
  game?: string;
  /**
   * Solo los clips sin juego (grabaciones de escritorio). No es un juego más: `game` es un nombre
   * exacto, y un clip cuyo juego se llamara "Escritorio" no debe confundirse con esto. Tiene
   * precedencia sobre `game`.
   */
  withoutGame?: boolean;
}

/**
 * Valor del desplegable de la biblioteca para "sin juego". Vive solo en la UI: al catálogo le
 * cruza `withoutGame`, no esta cadena.
 */
export const DESKTOP_FILTER_VALUE = '__escritorio__';

export const CLIP_TITLE_MAX = 120;
export const CLIP_TAG_MAX = 30;
export const CLIP_TAGS_LIMIT = 20;

/**
 * Valida y normaliza un patch de origen no confiable (IPC). Devuelve solo los campos
 * presentes y válidos; lanza si un campo presente es inválido (título vacío, etc.).
 */
export function normalizeClipPatch(input: unknown): ClipPatch {
  if (typeof input !== 'object' || input === null) return {};
  const raw = input as Record<string, unknown>;
  const patch: ClipPatch = {};

  if ('title' in raw) {
    if (typeof raw.title !== 'string' || !raw.title.trim()) {
      throw new Error('El título no puede estar vacío.');
    }
    patch.title = raw.title.trim().slice(0, CLIP_TITLE_MAX);
  }
  if ('game' in raw) {
    if (raw.game !== null && typeof raw.game !== 'string') {
      throw new Error('Juego inválido.');
    }
    patch.game = typeof raw.game === 'string' && raw.game.trim() ? raw.game.trim() : null;
  }
  if ('favorite' in raw) {
    if (typeof raw.favorite !== 'boolean') throw new Error('Favorito inválido.');
    patch.favorite = raw.favorite;
  }
  if ('tags' in raw) {
    if (!Array.isArray(raw.tags)) throw new Error('Las etiquetas deben ser una lista.');
    patch.tags = normalizeTags(raw.tags);
  }
  return patch;
}

/** Etiquetas: strings recortados, sin vacíos, sin duplicados (case-insensitive), con tope. */
export function normalizeTags(tags: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tags) {
    if (typeof t !== 'string') continue;
    const clean = t.trim().slice(0, CLIP_TAG_MAX);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= CLIP_TAGS_LIMIT) break;
  }
  return out;
}

/** Título por defecto a partir del nombre de archivo (sin extensión). */
export function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '');
  return base.trim() || fileName;
}

/**
 * Formatea bytes para la UI: `750 MB`, `3.4 GB`, `20 GB` (sin el decimal cuando es .0).
 * Lo usan el indicador del sidebar y la leyenda de uso de disco, que deben decir lo mismo.
 */
export function formatStorage(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 MB';
  const gb = bytes / 1024 ** 3;
  if (gb < 1) return `${Math.round(bytes / 1024 ** 2)} MB`;
  const redondeado = Math.round(gb * 10) / 10;
  return `${Number.isInteger(redondeado) ? redondeado : redondeado.toFixed(1)} GB`;
}

/**
 * Formatea el tamaño de **un archivo** para la UI: `340 KB`, `12.4 MB`, `3.2 GB`. A diferencia de
 * `formatStorage` (totales de disco, solo MB/GB), baja hasta KB/B para que las capturas de pocos
 * KB no salgan como "0 MB". Un decimal solo cuando aporta (no en `20 MB`).
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 KB';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const unidades = ['KB', 'MB', 'GB', 'TB'];
  let valor = bytes / 1024;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i++;
  }
  const redondeado = Math.round(valor * 10) / 10;
  return `${Number.isInteger(redondeado) ? redondeado : redondeado.toFixed(1)} ${unidades[i]}`;
}

/** Formatea segundos como m:ss (o h:mm:ss). Para la UI. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '–:––';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}
