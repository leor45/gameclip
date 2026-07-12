import { describe, expect, it } from 'vitest';
import type { ClipAudioTrack } from '../tracks';
import {
  activeTrackIndexes,
  hasRoleTracks,
  normalizeMutedTracks,
  normalizeSaveAudioEditRequest,
  selectableTracks,
  trackKey,
  trackLabel,
} from '../tracks';

// Layout por rol de la captura en modo apps: mezcla + fuentes aisladas.
const porRol: ClipAudioTrack[] = [
  { index: 0, name: 'default' },
  { index: 1, name: 'game' },
  { index: 2, name: 'mic' },
  { index: 3, name: 'opera' },
];

// Clip de modo escritorio o anterior al layout por rol: una sola pista, sin nombre.
const sinRoles: ClipAudioTrack[] = [{ index: 0, name: null }];

describe('pistas de audio — layout por rol', () => {
  it('reconoce el layout por rol y ofrece las fuentes (sin la mezcla)', () => {
    expect(hasRoleTracks(porRol)).toBe(true);
    expect(selectableTracks(porRol).map(trackLabel)).toEqual(['game', 'mic', 'opera']);
  });

  it('un clip sin pistas nombradas no soporta edit y solo ofrece su única pista', () => {
    expect(hasRoleTracks(sinRoles)).toBe(false);
    expect(selectableTracks(sinRoles)).toEqual(sinRoles);
    expect(trackLabel(sinRoles[0])).toBe('Audio');
    expect(trackKey(sinRoles[0])).toBe('pista-0');
  });

  it('una pista `default` sola tampoco es layout por rol (no hay fuentes que mezclar)', () => {
    expect(hasRoleTracks([{ index: 0, name: 'default' }])).toBe(false);
  });

  it('un clip sin audio no tiene nada seleccionable', () => {
    expect(selectableTracks([])).toEqual([]);
    expect(activeTrackIndexes([], [])).toEqual([]);
  });
});

describe('pistas activas', () => {
  it('sin muteadas devuelve todas las fuentes, en el orden del archivo', () => {
    expect(activeTrackIndexes(porRol, [])).toEqual([1, 2, 3]);
  });

  it('excluye las muteadas por su clave', () => {
    expect(activeTrackIndexes(porRol, ['mic'])).toEqual([1, 3]);
    expect(activeTrackIndexes(porRol, ['game', 'mic', 'opera'])).toEqual([]);
  });

  it('la mezcla `default` nunca entra como fuente, ni marcándola', () => {
    expect(activeTrackIndexes(porRol, [])).not.toContain(0);
  });
});

describe('normalización desde el IPC', () => {
  it('descarta basura y duplicados de la lista de muteadas', () => {
    expect(normalizeMutedTracks(['mic', ' mic ', '', 7, null, 'game'])).toEqual(['mic', 'game']);
    expect(normalizeMutedTracks('mic')).toEqual([]);
  });

  it('valida el id del clip', () => {
    expect(normalizeSaveAudioEditRequest({ clipId: 3, mutedTracks: ['mic'] })).toEqual({
      clipId: 3,
      mutedTracks: ['mic'],
    });
    expect(() => normalizeSaveAudioEditRequest({ clipId: 0 })).toThrow(/id de clip/i);
    expect(() => normalizeSaveAudioEditRequest(null)).toThrow(/inválido/i);
  });

  it('sin lista de muteadas, no hay ninguna muteada', () => {
    expect(normalizeSaveAudioEditRequest({ clipId: 1 }).mutedTracks).toEqual([]);
  });
});
