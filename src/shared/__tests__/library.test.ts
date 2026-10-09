import { describe, expect, it } from 'vitest';
import {
  CLIP_TAGS_LIMIT,
  TEMP_FILE_PREFIX,
  computeGameStats,
  formatDuration,
  formatFileSize,
  isTempMediaFile,
  normalizeClipPatch,
  normalizeTags,
  titleFromFileName,
} from '../library';

describe('normalizeClipPatch', () => {
  it('devuelve solo los campos presentes, normalizados', () => {
    const patch = normalizeClipPatch({ title: '  Mi clip  ', favorite: true });
    expect(patch).toEqual({ title: 'Mi clip', favorite: true });
  });

  it('rechaza título vacío o no-string', () => {
    expect(() => normalizeClipPatch({ title: '   ' })).toThrow(/título/i);
    expect(() => normalizeClipPatch({ title: 7 })).toThrow(/título/i);
  });

  it('acepta game string o null y convierte vacío en null', () => {
    expect(normalizeClipPatch({ game: ' Valorant ' })).toEqual({ game: 'Valorant' });
    expect(normalizeClipPatch({ game: '' })).toEqual({ game: null });
    expect(normalizeClipPatch({ game: null })).toEqual({ game: null });
    expect(() => normalizeClipPatch({ game: 3 })).toThrow(/juego/i);
  });

  it('rechaza favorite y tags con tipos inválidos', () => {
    expect(() => normalizeClipPatch({ favorite: 'sí' })).toThrow(/favorito/i);
    expect(() => normalizeClipPatch({ tags: 'una' })).toThrow(/etiquetas/i);
  });

  it('con entrada no-objeto devuelve patch vacío', () => {
    expect(normalizeClipPatch(null)).toEqual({});
    expect(normalizeClipPatch('x')).toEqual({});
  });
});

describe('normalizeTags', () => {
  it('recorta, quita vacíos y deduplica sin distinguir mayúsculas', () => {
    expect(normalizeTags([' ace ', 'ACE', '', 'clutch', 42])).toEqual(['ace', 'clutch']);
  });

  it('respeta el tope de etiquetas', () => {
    const muchas = Array.from({ length: CLIP_TAGS_LIMIT + 5 }, (_, i) => `tag${i}`);
    expect(normalizeTags(muchas)).toHaveLength(CLIP_TAGS_LIMIT);
  });
});

describe('isTempMediaFile', () => {
  it('reconoce los temporales propios y no un clip normal', () => {
    expect(isTempMediaFile('.gameclip-names-1234-1700000000000.mp4')).toBe(true);
    expect(isTempMediaFile('D:\\clips\\Terraria\\.gameclip-edit-1-2.mp4')).toBe(true);
    expect(isTempMediaFile('Terraria 2026.07.02 - 10.02.01.01.mp4')).toBe(false);
    expect(isTempMediaFile('.gameclip.mp4')).toBe(false); // sin el guion no es nuestro
  });

  it('el prefijo es el que usan los temporales reales', () => {
    expect(`${TEMP_FILE_PREFIX}names-1-2.mp4`.startsWith('.gameclip-')).toBe(true);
  });
});

describe('titleFromFileName', () => {
  it('quita la extensión', () => {
    expect(titleFromFileName('Replay 2026-07-11 20-15-30.mp4')).toBe('Replay 2026-07-11 20-15-30');
  });

  it('cae al nombre completo si queda vacío', () => {
    expect(titleFromFileName('.mp4')).toBe('.mp4');
  });
});

describe('formatDuration', () => {
  it('formatea minutos y horas', () => {
    expect(formatDuration(45)).toBe('0:45');
    expect(formatDuration(83)).toBe('1:23');
    expect(formatDuration(3671)).toBe('1:01:11');
  });

  it('null o inválido devuelve marcador', () => {
    expect(formatDuration(null)).toBe('–:––');
    expect(formatDuration(-3)).toBe('–:––');
  });
});

describe('formatFileSize', () => {
  it('usa B / KB / MB / GB según el tamaño', () => {
    expect(formatFileSize(500)).toBe('500 B');
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(348_160)).toBe('340 KB');
    expect(formatFileSize(13_002_342)).toBe('12.4 MB');
    expect(formatFileSize(3.2 * 1024 ** 3)).toBe('3.2 GB');
  });

  it('sin decimal cuando es entero', () => {
    expect(formatFileSize(20 * 1024 ** 2)).toBe('20 MB');
  });

  it('0, negativos o no finitos caen a 0 KB', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(-5)).toBe('0 KB');
    expect(formatFileSize(NaN)).toBe('0 KB');
  });
});

describe('computeGameStats (contadores del filtro de juego)', () => {
  it('cuenta total, escritorio (sin juego) y por juego, de más a menos clips', () => {
    const stats = computeGameStats([
      { game: 'Hades' },
      { game: 'Rocket League' },
      { game: null },
      { game: 'Rocket League' },
      { game: 'Monster Hunter Wilds' },
      { game: 'Rocket League' },
      { game: null },
    ]);
    expect(stats).toEqual({
      total: 7,
      desktop: 2,
      games: [
        { name: 'Rocket League', count: 3 },
        { name: 'Hades', count: 1 },
        { name: 'Monster Hunter Wilds', count: 1 },
      ],
    });
  });

  it('catálogo vacío', () => {
    expect(computeGameStats([])).toEqual({ total: 0, desktop: 0, games: [] });
  });
});
