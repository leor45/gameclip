import { describe, expect, it } from 'vitest';
import { normalizeExportRequest } from '../export';

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
});
