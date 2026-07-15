import { describe, expect, it } from 'vitest';
import { normalizeExportRequest, normalizeSegments } from '../export';

const valido = {
  clipId: 3,
  startSeconds: 1.234,
  endSeconds: 8.5,
  format: 'mp4',
  quality: 'media',
};

describe('normalizeExportRequest', () => {
  it('acepta un request válido y redondea a centésimas', () => {
    const req = normalizeExportRequest(valido);
    expect(req).toEqual({
      clipId: 3,
      startSeconds: 1.23,
      endSeconds: 8.5,
      format: 'mp4',
      quality: 'media',
    });
  });

  it('rechaza recortes demasiado cortos o invertidos', () => {
    expect(() => normalizeExportRequest({ ...valido, endSeconds: 1.3 })).toThrow(/al menos/i);
    expect(() => normalizeExportRequest({ ...valido, endSeconds: 0.5 })).toThrow(/al menos/i);
  });

  it('rechaza id, tiempos, formato y calidad inválidos', () => {
    expect(() => normalizeExportRequest({ ...valido, clipId: 0 })).toThrow(/id/i);
    expect(() => normalizeExportRequest({ ...valido, startSeconds: -1 })).toThrow(/inicio/i);
    expect(() => normalizeExportRequest({ ...valido, endSeconds: NaN })).toThrow(/fin/i);
    expect(() => normalizeExportRequest({ ...valido, format: 'avi' })).toThrow(/formato/i);
    expect(() => normalizeExportRequest({ ...valido, quality: 'ultra' })).toThrow(/calidad/i);
    expect(() => normalizeExportRequest(null)).toThrow(/inválido/i);
  });

  it('incluye segmentos válidos (ordenados y redondeados) cuando vienen', () => {
    const req = normalizeExportRequest({
      ...valido,
      segments: [
        { start: 6, end: 10 },
        { start: 0, end: 3.004 },
      ],
    });
    expect(req.segments).toEqual([
      { start: 0, end: 3 },
      { start: 6, end: 10 },
    ]);
  });

  it('incluye reframe activo con dimensiones de la fuente', () => {
    const req = normalizeExportRequest({
      ...valido,
      reframe: { aspect: '9:16', mode: 'cover', zoom: 1.5, offset: { x: -0.2, y: 0 } },
      sourceWidth: 2560.4,
      sourceHeight: 1440,
    });
    expect(req.reframe).toEqual({
      aspect: '9:16',
      mode: 'cover',
      zoom: 1.5,
      offset: { x: -0.2, y: 0 },
    });
    expect(req.sourceWidth).toBe(2560);
    expect(req.sourceHeight).toBe(1440);
  });

  it('omite reframe si es original, o si faltan/ son inválidas las dimensiones', () => {
    const original = normalizeExportRequest({
      ...valido,
      reframe: { aspect: 'original', mode: 'cover', zoom: 1, offset: { x: 0, y: 0 } },
      sourceWidth: 2560,
      sourceHeight: 1440,
    });
    expect(original.reframe).toBeUndefined();
    expect(original.sourceWidth).toBeUndefined();

    const sinDims = normalizeExportRequest({
      ...valido,
      reframe: { aspect: '9:16', mode: 'cover', zoom: 1, offset: { x: 0, y: 0 } },
    });
    expect(sinDims.reframe).toBeUndefined();

    const dimsMalas = normalizeExportRequest({
      ...valido,
      reframe: { aspect: '9:16', mode: 'cover', zoom: 1, offset: { x: 0, y: 0 } },
      sourceWidth: 0,
      sourceHeight: -5,
    });
    expect(dimsMalas.reframe).toBeUndefined();
  });
});

describe('normalizeSegments', () => {
  it('ordena por inicio y redondea a centésimas', () => {
    expect(
      normalizeSegments([
        { start: 6, end: 10 },
        { start: 0, end: 3.006 },
      ]),
    ).toEqual([
      { start: 0, end: 3.01 },
      { start: 6, end: 10 },
    ]);
  });

  it('descarta entradas inválidas o duración conservada bajo el mínimo', () => {
    expect(normalizeSegments([])).toBeUndefined();
    expect(normalizeSegments('nope')).toBeUndefined();
    expect(normalizeSegments([{ start: 5, end: 5 }])).toBeUndefined(); // end <= start
    expect(normalizeSegments([{ start: -1, end: 4 }])).toBeUndefined(); // start < 0
    expect(normalizeSegments([{ start: 0, end: 0.2 }])).toBeUndefined(); // muy corto
    expect(normalizeSegments([{ start: 0, end: 'x' }])).toBeUndefined();
  });
});
