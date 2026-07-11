import { describe, expect, it } from 'vitest';
import {
  CLIP_TAGS_LIMIT,
  formatDuration,
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
