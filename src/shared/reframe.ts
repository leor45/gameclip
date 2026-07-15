// Modelo puro del **reencuadre** del editor avanzado (Fase 4): sin React ni Electron. Elegir una
// relación de aspecto de salida distinta a la del clip y decidir cómo encaja la imagen —recortando
// (con reposición y zoom) o con barras negras—. De una única **geometría canónica** (en píxeles de
// origen) derivan las dos salidas: la transformación CSS de la previa y el filtro de vídeo de ffmpeg,
// de modo que **previa = render** por construcción. Lo comparten la UI y los tests.

/** Relaciones de aspecto de salida ofrecidas. `original` = sin reencuadre (como el clip). */
export type AspectKey = 'original' | '16:9' | '9:16' | '1:1' | '4:5';

/** Cómo encaja la imagen cuando el aspecto de salida no coincide con el de la fuente. */
export type ReframeMode = 'cover' | 'contain';

export interface Point {
  x: number;
  y: number;
}

/**
 * Reencuadre de un clip. `cover` (recorte) llena el marco recortando lo que sobra, con `zoom` (1 = el
 * máximo que cabe conservando el aspecto; >1 acerca) y `offset` (centro del encuadre, normalizado
 * −1..1 sobre el margen disponible). `contain` (barras) mete la imagen entera con bandas negras y no
 * usa zoom/offset. Con `aspect: 'original'` no hay reencuadre y el resto se ignora.
 */
export interface Reframe {
  aspect: AspectKey;
  mode: ReframeMode;
  zoom: number;
  offset: Point;
}

/** Ratio ancho/alto de cada preset (excepto `original`, que toma el de la fuente). */
export const ASPECT_RATIOS: Record<Exclude<AspectKey, 'original'>, number> = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '1:1': 1,
  '4:5': 4 / 5,
};

/** Zoom máximo en modo recorte (4×). */
export const MAX_ZOOM = 4;

/** Zoom mínimo: 1 = el recorte más grande que cabe conservando el aspecto. */
export const MIN_ZOOM = 1;

/** Paso de zoom por “muesca” de rueda (multiplicativo, para que suba/baje parejo en todo el rango). */
export const ZOOM_WHEEL_STEP = 1.1;

/** Reencuadre por defecto: sin reencuadre (imagen original). */
export const DEFAULT_REFRAME: Reframe = {
  aspect: 'original',
  mode: 'cover',
  zoom: 1,
  offset: { x: 0, y: 0 },
};

/** ¿El reencuadre cambia algo? `original` no toca la imagen. */
export function hasReframe(reframe: Reframe): boolean {
  return reframe.aspect !== 'original';
}

/** Ratio de salida: el del preset, o el de la fuente si es `original`. */
export function outputRatio(reframe: Reframe, sourceW: number, sourceH: number): number {
  if (reframe.aspect === 'original') return sourceW / sourceH;
  return ASPECT_RATIOS[reframe.aspect];
}

/** Acota un offset al margen normalizado `[-1, 1]` en cada eje (fuera de él el recorte se saldría). */
export function clampOffset(offset: Point): Point {
  return { x: clamp(offset.x, -1, 1), y: clamp(offset.y, -1, 1) };
}

/** Acota el zoom a `[MIN_ZOOM, MAX_ZOOM]`. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_ZOOM;
  return clamp(zoom, MIN_ZOOM, MAX_ZOOM);
}

/** Rectángulo en píxeles (de origen o de salida). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Geometría canónica del reencuadre. `viewRect` es el rectángulo —en coordenadas de la **fuente**—
 * que muestra el marco de salida (base exacta de la previa; en `contain` se extiende fuera de la
 * fuente: eso son las barras). `outputW/outputH` es la resolución del MP4 (par). `kind` distingue la
 * ruta de filtro de ffmpeg.
 */
export interface ReframeGeometry {
  kind: 'identity' | 'cover' | 'contain';
  sourceW: number;
  sourceH: number;
  /** Rectángulo de la fuente que ocupa el marco (coords de origen; puede salirse en `contain`). */
  viewRect: Rect;
  /** Resolución de salida, par (requisito de libx264/yuv420p). */
  outputW: number;
  outputH: number;
  /** Recorte en píxeles de origen (solo `cover`), ya redondeado a par para ffmpeg. */
  crop?: Rect;
  /** Escalado + relleno de salida (solo `contain`), todo par. */
  pad?: { scaledW: number; scaledH: number; padX: number; padY: number };
}

/**
 * Calcula la geometría canónica a partir del reencuadre y las dimensiones de la fuente. Es el corazón
 * del módulo: todo lo demás (previa y ffmpeg) se deriva de aquí, así que previa y render no divergen.
 */
export function reframeGeometry(
  reframe: Reframe,
  sourceW: number,
  sourceH: number,
): ReframeGeometry {
  const sw = Math.max(1, sourceW);
  const sh = Math.max(1, sourceH);

  // Sin reencuadre: el marco muestra la fuente entera; salida = fuente (a par).
  if (reframe.aspect === 'original') {
    return {
      kind: 'identity',
      sourceW: sw,
      sourceH: sh,
      viewRect: { x: 0, y: 0, w: sw, h: sh },
      outputW: even(sw),
      outputH: even(sh),
    };
  }

  const r = ASPECT_RATIOS[reframe.aspect];
  const sourceRatio = sw / sh;

  if (reframe.mode === 'contain') {
    // Barras: la fuente entera cabe en un lienzo con el aspecto de salida. No se escala la fuente
    // (solo se acota a par), se rellena alrededor → la resolución de la imagen se conserva.
    let canvasW: number;
    let canvasH: number;
    if (sourceRatio > r) {
      // Fuente más ancha que el marco → llena el ancho, barras arriba/abajo (letterbox).
      canvasW = sw;
      canvasH = sw / r;
    } else {
      // Fuente más alta/estrecha → llena el alto, barras a los lados (pillarbox).
      canvasH = sh;
      canvasW = sh * r;
    }
    const padXsrc = (canvasW - sw) / 2;
    const padYsrc = (canvasH - sh) / 2;

    const scaledW = even(sw);
    const scaledH = even(sh);
    const outW = even(canvasW);
    const outH = even(canvasH);
    return {
      kind: 'contain',
      sourceW: sw,
      sourceH: sh,
      viewRect: { x: -padXsrc, y: -padYsrc, w: canvasW, h: canvasH },
      outputW: outW,
      outputH: outH,
      pad: {
        scaledW,
        scaledH,
        padX: evenCoord((outW - scaledW) / 2),
        padY: evenCoord((outH - scaledH) / 2),
      },
    };
  }

  // Recorte (cover): el mayor rectángulo con el aspecto de salida que cabe en la fuente, dividido por
  // el zoom y desplazado por el offset. La resolución de salida es la del recorte a zoom 1 (el recorte
  // más chico al hacer zoom se escala **hasta** esa resolución: acercar no cambia la resolución final).
  let baseCropW: number;
  let baseCropH: number;
  if (sourceRatio > r) {
    baseCropH = sh;
    baseCropW = sh * r;
  } else {
    baseCropW = sw;
    baseCropH = sw / r;
  }
  const zoom = clampZoom(reframe.zoom);
  const cropW = baseCropW / zoom;
  const cropH = baseCropH / zoom;
  const slackX = sw - cropW;
  const slackY = sh - cropH;
  const off = clampOffset(reframe.offset);
  const cropX = clamp((slackX / 2) * (1 + off.x), 0, slackX);
  const cropY = clamp((slackY / 2) * (1 + off.y), 0, slackY);

  // Recorte a enteros pares, acotado para no salirse de la fuente; escala a la resolución base (par).
  const cw = evenClampDown(cropW, sw);
  const ch = evenClampDown(cropH, sh);
  const cx = evenCoord(clamp(cropX, 0, sw - cw));
  const cy = evenCoord(clamp(cropY, 0, sh - ch));
  return {
    kind: 'cover',
    sourceW: sw,
    sourceH: sh,
    viewRect: { x: cropX, y: cropY, w: cropW, h: cropH },
    outputW: even(baseCropW),
    outputH: even(baseCropH),
    crop: { x: cx, y: cy, w: cw, h: ch },
  };
}

/** Transformación CSS de la previa: coloca el `<video>` (tamaño natural, origen top-left) de modo que
 * el marco `frameW` de ancho muestre exactamente `viewRect`. `scale` y traslación en px de pantalla. */
export interface PreviewTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

export function previewTransform(geom: ReframeGeometry, frameW: number): PreviewTransform {
  const s = geom.viewRect.w > 0 ? frameW / geom.viewRect.w : 1;
  return { scale: s, translateX: -geom.viewRect.x * s, translateY: -geom.viewRect.y * s };
}

/**
 * Filtro de vídeo de ffmpeg para el reencuadre, o `null` si no cambia nada (`identity`). `cover`
 * recorta y escala; `contain` escala (a par) y rellena con negro. Se compone en el filtergraph del
 * render (rutas simple y concat).
 */
export function reframeVideoFilter(geom: ReframeGeometry): string | null {
  if (geom.kind === 'identity') return null;
  if (geom.kind === 'cover' && geom.crop) {
    const c = geom.crop;
    return `crop=${c.w}:${c.h}:${c.x}:${c.y},scale=${geom.outputW}:${geom.outputH}`;
  }
  if (geom.kind === 'contain' && geom.pad) {
    const p = geom.pad;
    return `scale=${p.scaledW}:${p.scaledH},pad=${geom.outputW}:${geom.outputH}:${p.padX}:${p.padY}:black`; // prettier-ignore
  }
  return null;
}

/** Nuevo offset al arrastrar la imagen `dxPx/dyPx` px de pantalla (modo `cover`). Convierte el arrastre
 * a desplazamiento del recorte en la fuente y lo normaliza sobre el margen disponible (depende del
 * zoom). Arrastrar la imagen a la derecha revela la parte izquierda (el offset baja). */
export function applyPan(
  reframe: Reframe,
  sourceW: number,
  sourceH: number,
  frameW: number,
  dxPx: number,
  dyPx: number,
): Point {
  if (reframe.aspect === 'original' || reframe.mode !== 'cover' || frameW <= 0) {
    return reframe.offset;
  }
  const geom = reframeGeometry(reframe, sourceW, sourceH);
  const pxToSource = geom.viewRect.w / frameW; // px de pantalla → px de origen
  const slackX = geom.sourceW - geom.viewRect.w;
  const slackY = geom.sourceH - geom.viewRect.h;
  const dOffX = slackX > 0 ? (-dxPx * pxToSource) / (slackX / 2) : 0;
  const dOffY = slackY > 0 ? (-dyPx * pxToSource) / (slackY / 2) : 0;
  return clampOffset({ x: reframe.offset.x + dOffX, y: reframe.offset.y + dOffY });
}

/** Nuevo zoom a partir de la rueda: arriba acerca, abajo aleja (multiplicativo, acotado). */
export function wheelToZoom(current: number, deltaY: number): number {
  const base = Number.isFinite(current) ? current : MIN_ZOOM;
  return clampZoom(deltaY < 0 ? base * ZOOM_WHEEL_STEP : base / ZOOM_WHEEL_STEP);
}

/**
 * Valida y normaliza un reencuadre de origen no confiable (IPC). Aspect/mode inválidos caen a los
 * defaults, el zoom se acota a `[1, MAX_ZOOM]` y el offset a `[-1, 1]`. `original` se canonicaliza a
 * “sin reencuadre” (zoom 1, offset 0).
 */
export function normalizeReframe(input: unknown): Reframe {
  if (typeof input !== 'object' || input === null) return { ...DEFAULT_REFRAME };
  const raw = input as Record<string, unknown>;

  const aspect: AspectKey =
    raw.aspect === '16:9' ||
    raw.aspect === '9:16' ||
    raw.aspect === '1:1' ||
    raw.aspect === '4:5' ||
    raw.aspect === 'original'
      ? raw.aspect
      : 'original';

  if (aspect === 'original') return { ...DEFAULT_REFRAME };

  const mode: ReframeMode = raw.mode === 'contain' ? 'contain' : 'cover';
  const zoom = clampZoom(typeof raw.zoom === 'number' ? raw.zoom : MIN_ZOOM);
  const rawOffset =
    typeof raw.offset === 'object' && raw.offset !== null
      ? (raw.offset as Record<string, unknown>)
      : {};
  const offset = clampOffset({
    x: typeof rawOffset.x === 'number' && Number.isFinite(rawOffset.x) ? rawOffset.x : 0,
    y: typeof rawOffset.y === 'number' && Number.isFinite(rawOffset.y) ? rawOffset.y : 0,
  });
  return { aspect, mode, zoom, offset };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Redondea a entero **par** ≥ 2 (libx264/yuv420p exige dimensiones pares). */
function even(n: number): number {
  const r = Math.round(n);
  return Math.max(2, r % 2 === 0 ? r : r - 1);
}

/** Como `even`, pero sin pasar de `max` (para que un recorte no exceda la fuente). */
function evenClampDown(n: number, max: number): number {
  const capped = Math.min(Math.floor(n), Math.floor(max));
  return Math.max(2, capped % 2 === 0 ? capped : capped - 1);
}

/** Coordenada/desplazamiento par ≥ 0 (crop x/y, relleno): a diferencia de `even`, admite 0. */
function evenCoord(n: number): number {
  const r = Math.round(n);
  return Math.max(0, r % 2 === 0 ? r : r - 1);
}
