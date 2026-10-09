import { describe, expect, it } from 'vitest';
import { normalizeCaptureSettings } from '../capture';
import {
  activeExcludedNames,
  autoExclusions,
  normalizeExcludedGames,
  normalizeRescanForce,
  syncExcludedGames,
  type ExcludedGame,
} from '../games';

describe('autoExclusions', () => {
  it('reconoce las apps de la lista curada por appid de Steam y por nombre', () => {
    expect(
      autoExclusions([
        { name: 'Wallpaper Engine', steamAppId: '431960' },
        { name: 'Lossless Scaling' }, // sin appid (otra fuente): basta el nombre
        { name: 'Monster Hunter Wilds', steamAppId: '2246340' },
      ]),
    ).toEqual(['Wallpaper Engine', 'Lossless Scaling']);
  });

  it('por appid aunque el catálogo le dé otro nombre (idioma, ™)', () => {
    expect(autoExclusions([{ name: 'Wallpaper Engine™', steamAppId: '431960' }])).toEqual([
      'Wallpaper Engine™',
    ]);
  });

  it('un juego normal no se excluye y no hay duplicados', () => {
    expect(
      autoExclusions([
        { name: 'Hades', steamAppId: '1145360' },
        { name: 'SteamVR', steamAppId: '250820' },
        { name: 'steamvr' },
      ]),
    ).toEqual(['SteamVR']);
  });
});

describe('syncExcludedGames', () => {
  const manual = (name: string, enabled = true): ExcludedGame => ({ name, source: 'manual', enabled });
  const auto = (name: string, enabled = true): ExcludedGame => ({ name, source: 'auto', enabled });

  it('añade como auto activo lo nuevo que detecta la lista curada', () => {
    expect(syncExcludedGames([], ['Wallpaper Engine'])).toEqual([auto('Wallpaper Engine')]);
  });

  it('salta lo que ya está a mano, aunque cambie la capitalización (lo pidió el owner)', () => {
    const lista = [manual('lossless scaling')];
    expect(syncExcludedGames(lista, ['Lossless Scaling'])).toEqual([manual('lossless scaling')]);
  });

  it('respeta un auto desactivado: no lo reactiva', () => {
    const lista = [auto('Wallpaper Engine', false)];
    expect(syncExcludedGames(lista, ['Wallpaper Engine'])).toEqual([auto('Wallpaper Engine', false)]);
  });

  it('quita los auto que ya no están instalados y nunca los manuales', () => {
    const lista = [auto('SteamVR'), manual('Mi App')];
    expect(syncExcludedGames(lista, [])).toEqual([manual('Mi App')]);
  });
});

describe('activeExcludedNames', () => {
  it('solo las activas, en minúsculas', () => {
    const lista: ExcludedGame[] = [
      { name: 'Wallpaper Engine', source: 'auto', enabled: true },
      { name: 'SteamVR', source: 'auto', enabled: false },
    ];
    expect([...activeExcludedNames(lista)]).toEqual(['wallpaper engine']);
  });
});

describe('normalizeExcludedGames', () => {
  it('limpia, deduplica por nombre y aplica defaults', () => {
    expect(
      normalizeExcludedGames([
        { name: '  Wallpaper Engine ', source: 'auto', enabled: false },
        { name: 'wallpaper engine', source: 'manual' },
        { name: 'Mi App' },
        { name: '' },
        'basura',
        null,
      ]),
    ).toEqual([
      { name: 'Wallpaper Engine', source: 'auto', enabled: false },
      { name: 'Mi App', source: 'manual', enabled: true },
    ]);
  });

  it('forma parte de los ajustes de captura (default vacío)', () => {
    expect(normalizeCaptureSettings({}).excludedGames).toEqual([]);
    expect(normalizeCaptureSettings({ excludedGames: 'x' }).excludedGames).toEqual([]);
    expect(
      normalizeCaptureSettings({ excludedGames: [{ name: 'SteamVR', source: 'auto' }] })
        .excludedGames,
    ).toEqual([{ name: 'SteamVR', source: 'auto', enabled: true }]);
  });
});

describe('normalizeRescanForce (opciones del rescan que manda el renderer)', () => {
  it('solo un `force: false` explícito pide un refresco normal («Sincronizar»)', () => {
    expect(normalizeRescanForce({ force: false })).toBe(false);
  });

  it('sin opciones o con cualquier otra cosa fuerza el re-escaneo («Volver a escanear»)', () => {
    const otros: unknown[] = [
      undefined,
      null,
      {},
      { force: true },
      { force: 'false' },
      { force: 0 },
      { force: null },
      false,
      'force',
      [],
    ];
    for (const opciones of otros) expect(normalizeRescanForce(opciones)).toBe(true);
  });
});
