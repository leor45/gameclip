import { describe, expect, it } from 'vitest';
import type { ClipAudioTrack } from '../tracks';
import {
  activeTrackIndexes,
  clampTrackGain,
  hasRoleTracks,
  mutedToVolumes,
  normalizeMutedTracks,
  normalizeSaveAudioEditRequest,
  normalizeTrackVolumes,
  selectableTrackGains,
  selectableTracks,
  trackGain,
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

// Layout por rol de una captura de escritorio con "PC y micrófono en pistas separadas".
const escritorioSeparado: ClipAudioTrack[] = [
  { index: 0, name: 'default' },
  { index: 1, name: 'pc' },
  { index: 2, name: 'mic' },
];

// Clip de escritorio con un solo audio (o anterior al layout por rol): una pista, sin nombre.
const sinRoles: ClipAudioTrack[] = [{ index: 0, name: null }];

describe('pistas de audio — layout por rol', () => {
  it('reconoce el layout por rol y ofrece las fuentes (sin la mezcla)', () => {
    expect(hasRoleTracks(porRol)).toBe(true);
    expect(selectableTracks(porRol).map(trackLabel)).toEqual(['game', 'mic', 'opera']);
  });

  it('un clip de escritorio con PC y micro separados se edita como uno de juego', () => {
    expect(hasRoleTracks(escritorioSeparado)).toBe(true);
    expect(selectableTracks(escritorioSeparado).map(trackLabel)).toEqual(['pc', 'mic']);
    // Muteando el micro, la mezcla se rehace solo con el audio del PC.
    expect(activeTrackIndexes(escritorioSeparado, ['mic'])).toEqual([1]);
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

describe('volumen por pista (editor avanzado)', () => {
  it('la ganancia de una pista sin ajuste es 1 (100 %)', () => {
    expect(trackGain({}, 'game')).toBe(1);
    expect(trackGain({ mic: 0.5 }, 'game')).toBe(1);
  });

  it('devuelve la ganancia guardada, acotada a [0, 2]', () => {
    expect(trackGain({ game: 1.5 }, 'game')).toBe(1.5);
    expect(trackGain({ game: 0 }, 'game')).toBe(0);
    expect(clampTrackGain(5)).toBe(2);
    expect(clampTrackGain(-3)).toBe(0);
    expect(clampTrackGain(NaN)).toBe(1);
  });

  it('mapea las pistas seleccionables a su ganancia (la default nunca entra)', () => {
    expect(selectableTrackGains(porRol, { mic: 0, opera: 2 })).toEqual([
      { index: 1, gain: 1 },
      { index: 2, gain: 0 },
      { index: 3, gain: 2 },
    ]);
  });

  it('normaliza volúmenes del IPC: claves válidas, ganancias finitas y acotadas', () => {
    expect(normalizeTrackVolumes({ game: 1.2, mic: 5, bad: 'x', '': 1, spotify: -1 })).toEqual({
      game: 1.2,
      mic: 2,
      spotify: 0,
    });
    expect(normalizeTrackVolumes(null)).toEqual({});
    expect(normalizeTrackVolumes([1, 2])).toEqual({});
  });

  it('proyecta las muteadas del editor simple como volumen 0 (compat)', () => {
    expect(mutedToVolumes(['mic', 'game'])).toEqual({ mic: 0, game: 0 });
    expect(mutedToVolumes([])).toEqual({});
  });
});
