import { describe, expect, it } from 'vitest';
import {
  applyPan,
  clampOffset,
  clampZoom,
  DEFAULT_REFRAME,
  hasReframe,
  MAX_ZOOM,
  normalizeReframe,
  outputRatio,
  previewTransform,
  reframeGeometry,
  reframeVideoFilter,
  wheelToZoom,
  type Reframe,
} from '../reframe';

const base = (over: Partial<Reframe> = {}): Reframe => ({ ...DEFAULT_REFRAME, ...over });

describe('outputRatio / hasReframe', () => {
  it('original toma el ratio de la fuente y no reencuadra', () => {
    expect(hasReframe(base())).toBe(false);
    expect(outputRatio(base(), 2560, 1440)).toBeCloseTo(2560 / 1440);
  });

  it('un preset fija el ratio de salida', () => {
    expect(hasReframe(base({ aspect: '9:16' }))).toBe(true);
    expect(outputRatio(base({ aspect: '9:16' }), 2560, 1440)).toBeCloseTo(9 / 16);
    expect(outputRatio(base({ aspect: '1:1' }), 2560, 1440)).toBe(1);
  });
});

describe('geometría cover (recorte) 16:9 → 9:16', () => {
  it('a zoom 1 recorta centrado, con dims pares y aspecto de salida', () => {
    const g = reframeGeometry(base({ aspect: '9:16' }), 2560, 1440);
    expect(g.kind).toBe('cover');
    // Fuente más ancha que 9:16 → limita el alto: cropH = 1440, cropW = 1440*9/16 = 810.
    // Recorte centrado horizontalmente: (2560 - 810) / 2 = 875 → par 874 (se redondea a par).
    expect(g.crop).toEqual({ x: 874, y: 0, w: 810, h: 1440 });
    expect(g.crop!.x % 2).toBe(0);
    expect(g.outputW).toBe(810);
    expect(g.outputH).toBe(1440);
    expect(g.outputW % 2).toBe(0);
    expect(g.outputH % 2).toBe(0);
  });

  it('el offset desplaza el recorte y se clampa a los bordes', () => {
    const izq = reframeGeometry(base({ aspect: '9:16', offset: { x: -1, y: 0 } }), 2560, 1440);
    expect(izq.crop!.x).toBe(0); // pegado a la izquierda
    const der = reframeGeometry(base({ aspect: '9:16', offset: { x: 1, y: 0 } }), 2560, 1440);
    expect(der.crop!.x).toBe(2560 - der.crop!.w); // pegado a la derecha
    // Un offset fuera de rango no saca el recorte de la fuente.
    const fuera = reframeGeometry(base({ aspect: '9:16', offset: { x: 5, y: 0 } }), 2560, 1440);
    expect(fuera.crop!.x + fuera.crop!.w).toBeLessThanOrEqual(2560);
  });

  it('el zoom achica el recorte pero mantiene la resolución de salida', () => {
    const g = reframeGeometry(base({ aspect: '9:16', zoom: 2 }), 2560, 1440);
    // A zoom 2 el recorte es la mitad: cropH = 720, cropW = 405 → par 404.
    expect(g.crop!.h).toBe(720);
    expect(g.crop!.w % 2).toBe(0);
    // La salida sigue siendo la del recorte a zoom 1.
    expect(g.outputH).toBe(1440);
    expect(g.outputW).toBe(810);
  });
});

describe('geometría contain (barras) 16:9 → 9:16', () => {
  it('mete la fuente entera con relleno (letterbox), todo par', () => {
    const g = reframeGeometry(base({ aspect: '9:16', mode: 'contain' }), 1920, 1080);
    expect(g.kind).toBe('contain');
    // Fuente más ancha que 9:16 → llena el ancho (1920), lienzo más alto: 1920 / (9/16) = 3413.33 → 3412.
    expect(g.outputW).toBe(1920);
    expect(g.outputH % 2).toBe(0);
    expect(g.outputH).toBeGreaterThan(1080); // hay barras arriba y abajo
    expect(g.pad!.scaledW).toBe(1920);
    expect(g.pad!.scaledH).toBe(1080);
    expect(g.pad!.padX).toBe(0);
    expect(g.pad!.padY).toBeGreaterThan(0);
    expect(g.pad!.padY % 2).toBe(0);
  });

  it('pillarbox cuando la fuente es más alta que el marco (16:9 desde 9:16)', () => {
    const g = reframeGeometry(base({ aspect: '16:9', mode: 'contain' }), 1080, 1920);
    // Fuente más alta → llena el alto (1920), lienzo más ancho: 1920 * 16/9 = 3413.33 → 3412.
    expect(g.outputH).toBe(1920);
    expect(g.outputW).toBeGreaterThan(1080); // barras a los lados
    expect(g.pad!.padY).toBe(0);
    expect(g.pad!.padX).toBeGreaterThan(0);
  });
});

describe('geometría identity (original)', () => {
  it('no recorta ni rellena y el filtro es null', () => {
    const g = reframeGeometry(base(), 2561, 1441); // dims impares → salida a par
    expect(g.kind).toBe('identity');
    expect(g.outputW % 2).toBe(0);
    expect(g.outputH % 2).toBe(0);
    expect(g.viewRect).toEqual({ x: 0, y: 0, w: 2561, h: 1441 });
    expect(reframeVideoFilter(g)).toBeNull();
  });
});

describe('reframeVideoFilter', () => {
  it('cover → crop + scale', () => {
    const g = reframeGeometry(base({ aspect: '9:16' }), 2560, 1440);
    expect(reframeVideoFilter(g)).toBe(
      `crop=${g.crop!.w}:${g.crop!.h}:${g.crop!.x}:${g.crop!.y},scale=${g.outputW}:${g.outputH}`,
    );
  });

  it('contain → scale + pad negro', () => {
    const g = reframeGeometry(base({ aspect: '9:16', mode: 'contain' }), 1920, 1080);
    expect(reframeVideoFilter(g)).toBe(
      `scale=${g.pad!.scaledW}:${g.pad!.scaledH},pad=${g.outputW}:${g.outputH}:${g.pad!.padX}:${g.pad!.padY}:black`,
    );
  });
});

describe('previewTransform describe el mismo rectángulo que el render (previa = render)', () => {
  it('cover: el marco muestra exactamente el recorte de la fuente', () => {
    const g = reframeGeometry(base({ aspect: '9:16', zoom: 1.5, offset: { x: -0.3, y: 0 } }), 2560, 1440); // prettier-ignore
    const frameW = 405; // ancho del marco de la previa en px
    const t = previewTransform(g, frameW);
    // El punto de origen (viewRect.x, viewRect.y) debe caer en la esquina (0,0) del marco…
    expect(t.translateX + g.viewRect.x * t.scale).toBeCloseTo(0);
    expect(t.translateY + g.viewRect.y * t.scale).toBeCloseTo(0);
    // …y la esquina opuesta del recorte, en (frameW, frameH).
    expect((g.viewRect.x + g.viewRect.w) * t.scale + t.translateX).toBeCloseTo(frameW);
  });

  it('contain: el vídeo queda centrado con barras (traslación = relleno escalado)', () => {
    const g = reframeGeometry(base({ aspect: '9:16', mode: 'contain' }), 1920, 1080);
    const frameW = 360;
    const t = previewTransform(g, frameW);
    // viewRect.x es negativo (relleno) → el vídeo se desplaza hacia dentro; no hay pan horizontal aquí.
    expect(t.translateX).toBeCloseTo(-g.viewRect.x * t.scale);
    expect(t.translateY).toBeGreaterThan(0); // barra superior
  });
});

describe('applyPan', () => {
  it('arrastrar a la derecha baja el offset x (revela la izquierda) y se clampa', () => {
    const r = base({ aspect: '9:16' });
    const next = applyPan(r, 2560, 1440, 405, 100, 0);
    expect(next.x).toBeLessThan(0);
    expect(next.x).toBeGreaterThanOrEqual(-1);
  });

  it('no hace nada en modo contain ni en original', () => {
    expect(applyPan(base({ aspect: '9:16', mode: 'contain' }), 2560, 1440, 405, 100, 0)).toEqual({ x: 0, y: 0 }); // prettier-ignore
    expect(applyPan(base(), 2560, 1440, 405, 100, 0)).toEqual({ x: 0, y: 0 });
  });

  it('sin margen en un eje, ese eje no se mueve', () => {
    // 9:16 desde 16:9 a zoom 1: el recorte llena el alto (slackY = 0) → arrastre vertical nulo.
    const next = applyPan(base({ aspect: '9:16' }), 2560, 1440, 405, 0, 100);
    expect(next.y).toBe(0);
  });
});

describe('zoom y offset: clamps', () => {
  it('clampZoom acota a [1, MAX_ZOOM]', () => {
    expect(clampZoom(0.5)).toBe(1);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  it('wheelToZoom acerca hacia arriba y aleja hacia abajo, acotado', () => {
    expect(wheelToZoom(1, -1)).toBeGreaterThan(1); // rueda arriba → acerca
    expect(wheelToZoom(1, 1)).toBe(1); // ya en el mínimo, rueda abajo no baja de 1
    expect(wheelToZoom(MAX_ZOOM, -1)).toBe(MAX_ZOOM); // tope
  });

  it('clampOffset acota a [-1, 1]', () => {
    expect(clampOffset({ x: -3, y: 2 })).toEqual({ x: -1, y: 1 });
  });
});

describe('normalizeReframe', () => {
  it('aspecto/modo inválidos caen a original', () => {
    expect(normalizeReframe({ aspect: 'raro' })).toEqual(DEFAULT_REFRAME);
    expect(normalizeReframe(null)).toEqual(DEFAULT_REFRAME);
    expect(normalizeReframe(42)).toEqual(DEFAULT_REFRAME);
  });

  it('original se canonicaliza a sin reencuadre', () => {
    expect(normalizeReframe({ aspect: 'original', zoom: 3, offset: { x: 0.5, y: 0.5 } })).toEqual(
      DEFAULT_REFRAME,
    );
  });

  it('acota zoom y offset, y respeta el modo', () => {
    const r = normalizeReframe({
      aspect: '9:16',
      mode: 'contain',
      zoom: 100,
      offset: { x: -9, y: 0.2 },
    });
    expect(r).toEqual({ aspect: '9:16', mode: 'contain', zoom: MAX_ZOOM, offset: { x: -1, y: 0.2 } });
  });

  it('modo inválido cae a cover; zoom no numérico a 1', () => {
    const r = normalizeReframe({ aspect: '1:1', mode: 'x', zoom: 'y', offset: 'z' });
    expect(r).toEqual({ aspect: '1:1', mode: 'cover', zoom: 1, offset: { x: 0, y: 0 } });
  });
});
