import { describe, expect, it } from 'vitest';
import {
  clampTime,
  clampZoomFactor,
  deleteSegment,
  filmstripSampleTimes,
  initialSegments,
  keptDuration,
  MIN_TRIM_SECONDS,
  nextKeptTime,
  outputStarts,
  outputToSource,
  pxToSeconds,
  secondsToPx,
  segmentAt,
  setSegmentsEnd,
  setSegmentsStart,
  sourceToOutput,
  setTrackVolume,
  splitAt,
  timelinePxPerSecond,
  wheelToGain,
  ZOOM_FACTOR_MAX,
  ZOOM_FACTOR_MIN,
} from '../timeline';

describe('filmstripSampleTimes', () => {
  it('reparte por el centro de cada tramo en un clip sin cortes', () => {
    expect(filmstripSampleTimes([{ start: 0, end: 10 }], 5)).toEqual([1, 3, 5, 7, 9]);
  });

  it('respeta los cortes: mapea los tiempos de salida a origen (salta el hueco)', () => {
    // Conservado [0,3] + [6,10] → salida 7 s. Centros de salida 0.5..6.5 → origen saltando 3→6.
    expect(
      filmstripSampleTimes(
        [
          { start: 0, end: 3 },
          { start: 6, end: 10 },
        ],
        7,
      ),
    ).toEqual([0.5, 1.5, 2.5, 6.5, 7.5, 8.5, 9.5]);
  });

  it('casos borde: count ≤ 0 o sin duración → vacío', () => {
    expect(filmstripSampleTimes([{ start: 0, end: 10 }], 0)).toEqual([]);
    expect(filmstripSampleTimes([{ start: 5, end: 5 }], 4)).toEqual([]);
  });
});

describe('conversión tiempo↔px y zoom', () => {
  it('convierte segundos a px y de vuelta', () => {
    expect(secondsToPx(3, 24)).toBe(72);
    expect(pxToSeconds(72, 24)).toBe(3);
    expect(pxToSeconds(50, 0)).toBe(0); // sin dividir por cero
  });

  it('acota el factor de zoom a su rango (mínimo 1× = fit)', () => {
    expect(clampZoomFactor(0.2)).toBe(ZOOM_FACTOR_MIN);
    expect(clampZoomFactor(9999)).toBe(ZOOM_FACTOR_MAX);
    expect(clampZoomFactor(NaN)).toBe(ZOOM_FACTOR_MIN);
    expect(clampZoomFactor(3)).toBe(3);
  });

  it('clampTime acota a [0, duration]', () => {
    expect(clampTime(-5, 10)).toBe(0);
    expect(clampTime(50, 10)).toBe(10);
    expect(clampTime(4, 10)).toBe(4);
  });

  it('px/segundo = fit × factor; a 1× llena el ancho, a 2× el doble', () => {
    // 28 s en 1264 px, factor 1 → llena el ancho exacto.
    expect(timelinePxPerSecond(1, 1264, 28)).toBeCloseTo(1264 / 28);
    // Factor 2 → el doble (scroll).
    expect(timelinePxPerSecond(2, 1264, 28)).toBeCloseTo((1264 / 28) * 2);
    // Factor por debajo de 1 se acota a 1 (no se puede alejar más que el fit).
    expect(timelinePxPerSecond(0.3, 1264, 28)).toBeCloseTo(1264 / 28);
    // Sin ancho medido aún, usa el px/s de reserva.
    expect(timelinePxPerSecond(1, 0, 28)).toBe(24);
  });
});

describe('segmentos — dividir / borrar', () => {
  it('empieza con un único segmento que cubre todo el clip', () => {
    expect(initialSegments(10)).toEqual([{ start: 0, end: 10 }]);
    expect(keptDuration(initialSegments(10))).toBe(10);
  });

  it('divide en el punto dado el segmento que lo contiene', () => {
    expect(splitAt([{ start: 0, end: 10 }], 4)).toEqual([
      { start: 0, end: 4 },
      { start: 4, end: 10 },
    ]);
  });

  it('no divide si un trozo quedaría bajo el mínimo, o si el punto está fuera', () => {
    const seg = [{ start: 0, end: 10 }];
    expect(splitAt(seg, MIN_TRIM_SECONDS / 2)).toEqual(seg); // trozo izquierdo muy corto
    expect(splitAt(seg, 10 - MIN_TRIM_SECONDS / 2)).toEqual(seg); // trozo derecho muy corto
    expect(splitAt([{ start: 0, end: 3 }, { start: 6, end: 10 }], 4)).toHaveLength(2); // 4 en hueco
  });

  it('borra un segmento (incluido el del medio) pero nunca deja la lista vacía', () => {
    const tres = [
      { start: 0, end: 3 },
      { start: 3, end: 6 },
      { start: 6, end: 10 },
    ];
    expect(deleteSegment(tres, 1)).toEqual([
      { start: 0, end: 3 },
      { start: 6, end: 10 },
    ]);
    expect(deleteSegment([{ start: 0, end: 10 }], 0)).toEqual([{ start: 0, end: 10 }]); // no vacía
  });

  it('keptDuration suma solo lo conservado', () => {
    expect(
      keptDuration([
        { start: 0, end: 3 },
        { start: 6, end: 10 },
      ]),
    ).toBe(7);
  });

  it('segmentAt localiza el segmento o devuelve -1 en un hueco', () => {
    const segs = [
      { start: 0, end: 3 },
      { start: 6, end: 10 },
    ];
    expect(segmentAt(segs, 1)).toBe(0);
    expect(segmentAt(segs, 8)).toBe(1);
    expect(segmentAt(segs, 4)).toBe(-1); // hueco
  });

  it('nextKeptTime salta huecos y avisa al pasar el final', () => {
    const segs = [
      { start: 0, end: 3 },
      { start: 6, end: 10 },
    ];
    expect(nextKeptTime(segs, 1)).toBe(1); // dentro de un segmento
    expect(nextKeptTime(segs, 4)).toBe(6); // en un hueco → siguiente inicio
    expect(nextKeptTime(segs, 10)).toBeNull(); // pasado el final
  });
});

describe('segmentos — tiempo de salida (timeline compactada)', () => {
  const segs = [
    { start: 0, end: 10 },
    { start: 30, end: 60 },
  ]; // hueco 10-30 borrado; salida = 40 s

  it('sourceToOutput compacta los huecos', () => {
    expect(sourceToOutput(segs, 0)).toBe(0);
    expect(sourceToOutput(segs, 5)).toBe(5); // dentro del primero
    expect(sourceToOutput(segs, 20)).toBe(10); // en el hueco → borde (fin del primero)
    expect(sourceToOutput(segs, 30)).toBe(10); // inicio del segundo
    expect(sourceToOutput(segs, 45)).toBe(25); // 10 + (45-30)
    expect(sourceToOutput(segs, 100)).toBe(40); // pasado el final → duración de salida
  });

  it('outputToSource es el inverso y salta al origen correcto', () => {
    expect(outputToSource(segs, 0)).toBe(0);
    expect(outputToSource(segs, 5)).toBe(5);
    expect(outputToSource(segs, 10)).toBe(10); // borde: fin del primero
    expect(outputToSource(segs, 25)).toBe(45); // 30 + (25-10)
    expect(outputToSource(segs, 999)).toBe(60); // acota al fin
  });

  it('outputStarts da los offsets contiguos de salida', () => {
    expect(outputStarts(segs)).toEqual([0, 10]);
    expect(outputStarts([{ start: 0, end: 3 }, { start: 3, end: 5 }, { start: 8, end: 10 }])).toEqual([
      0, 3, 5,
    ]);
  });
});

describe('segmentos — recorte de bordes', () => {
  const segs = [
    { start: 2, end: 6 },
    { start: 7, end: 8 },
  ];

  it('el inicio mueve el borde del primer segmento sin cruzar su fin', () => {
    expect(setSegmentsStart(segs, 5, 10)[0]).toEqual({ start: 5, end: 6 });
    expect(setSegmentsStart(segs, 9, 10)[0].start).toBe(6 - MIN_TRIM_SECONDS);
    expect(setSegmentsStart(segs, -3, 10)[0].start).toBe(0);
  });

  it('el fin mueve el borde del último segmento sin cruzar su inicio ni pasar la duración', () => {
    expect(setSegmentsEnd(segs, 7.5, 10)[1]).toEqual({ start: 7, end: 7.5 });
    expect(setSegmentsEnd(segs, 7, 10)[1].end).toBe(7 + MIN_TRIM_SECONDS);
    expect(setSegmentsEnd(segs, 50, 10)[1].end).toBe(10);
  });
});

describe('volumen por pista', () => {
  it('fija el volumen acotado, devolviendo un mapa nuevo', () => {
    const v = setTrackVolume({ game: 1 }, 'mic', 1.5);
    expect(v).toEqual({ game: 1, mic: 1.5 });
    expect(setTrackVolume({}, 'mic', 9).mic).toBe(2); // acotado
  });

  it('la rueda sube/baja y se acota a [0, 2]', () => {
    expect(wheelToGain(1, -100)).toBeCloseTo(1.05); // rueda arriba
    expect(wheelToGain(1, 100)).toBeCloseTo(0.95); // rueda abajo
    expect(wheelToGain(2, -100)).toBe(2); // no pasa de 2
    expect(wheelToGain(0, 100)).toBe(0); // no baja de 0
  });
});
