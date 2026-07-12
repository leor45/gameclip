import { describe, expect, it } from 'vitest';
import {
  AUDIO_APPS_TRACK_MAX,
  DEFAULT_CAPTURE_SETTINGS,
  REPLAY_SECONDS_MAX,
  REPLAY_SECONDS_MIN,
  captureProfile,
  normalizeCaptureSettings,
  orderedActiveAudioApps,
} from '../capture';

describe('captureProfile', () => {
  const s = DEFAULT_CAPTURE_SETTINGS; // escritorio activo + auto-switch activo

  it('con grabación de escritorio: el juego manda solo si el auto-switch está activo', () => {
    expect(captureProfile(s, false)).toBe('desktop');
    expect(captureProfile(s, true)).toBe('game');
    expect(captureProfile({ ...s, desktopAutoSwitchToGame: false }, true)).toBe('desktop');
  });

  it('sin grabación de escritorio: se captura el juego, y sin juego no se captura nada', () => {
    const soloJuego = { ...s, desktopRecordingEnabled: false };
    expect(captureProfile(soloJuego, true)).toBe('game');
    expect(captureProfile(soloJuego, false)).toBe('none');
    // El auto-switch es irrelevante sin grabación de escritorio.
    expect(captureProfile({ ...soloJuego, desktopAutoSwitchToGame: false }, true)).toBe('game');
  });
});

describe('normalizeCaptureSettings', () => {
  it('devuelve defaults ante entrada nula o basura', () => {
    expect(normalizeCaptureSettings(null)).toEqual(DEFAULT_CAPTURE_SETTINGS);
    expect(normalizeCaptureSettings('basura')).toEqual(DEFAULT_CAPTURE_SETTINGS);
    expect(normalizeCaptureSettings(42)).toEqual(DEFAULT_CAPTURE_SETTINGS);
  });

  it('conserva valores válidos', () => {
    const entrada = {
      resolution: '720p',
      fps: 30,
      quality: 'lossless',
      encoderId: 'jim_nvenc',
      replaySeconds: 120,
      micEnabled: false,
      replayHotkey: 'F9',
      outputDir: 'D:\\clips',
      bufferMode: 'game',
      overlayEnabled: false,
      autoLaunch: true,
    };
    // Los campos no enviados caen a sus defaults.
    expect(normalizeCaptureSettings(entrada)).toEqual({
      ...DEFAULT_CAPTURE_SETTINGS,
      ...entrada,
    });
  });

  it('corrige campo a campo los valores inválidos', () => {
    const result = normalizeCaptureSettings({
      resolution: '4k',
      fps: 59,
      quality: 'ultra',
      encoderId: 7,
      replaySeconds: 'mucho',
      micEnabled: 'sí',
      replayHotkey: '   ',
      outputDir: null,
    });
    expect(result).toEqual(DEFAULT_CAPTURE_SETTINGS);
  });

  it('normaliza los ajustes de comportamiento (Fase 6) con sus defaults', () => {
    // Defaults: comportamiento previo a la Fase 6 (buffer siempre, overlay sí, autostart no).
    const defaults = normalizeCaptureSettings({});
    expect(defaults.bufferMode).toBe('always');
    expect(defaults.overlayEnabled).toBe(true);
    expect(defaults.autoLaunch).toBe(false);

    expect(normalizeCaptureSettings({ bufferMode: 'game' }).bufferMode).toBe('game');
    expect(normalizeCaptureSettings({ bufferMode: 'auto' }).bufferMode).toBe('always');
    expect(normalizeCaptureSettings({ overlayEnabled: 'no' }).overlayEnabled).toBe(true);
    expect(normalizeCaptureSettings({ autoLaunch: 1 }).autoLaunch).toBe(false);
  });

  it('audioApps guardados sin `enabled` migran a enabled: true', () => {
    const result = normalizeCaptureSettings({
      audioApps: [
        { executable: 'Discord.exe', volume: 80 },
        { executable: 'Spotify.exe', volume: 50, enabled: false },
      ],
    });
    expect(result.audioApps).toEqual([
      { executable: 'Discord.exe', volume: 80, enabled: true },
      { executable: 'Spotify.exe', volume: 50, enabled: false },
    ]);
  });

  it('desmarca (no borra) las apps activas que exceden el tope de pistas', () => {
    // 4 apps activas; el tope es 3 pistas de app → la 4.ª (en orden de pista) queda enabled:false.
    const result = normalizeCaptureSettings({
      audioApps: [
        { executable: 'a.exe', volume: 100, enabled: true },
        { executable: 'b.exe', volume: 100, enabled: true },
        { executable: 'c.exe', volume: 100, enabled: true },
        { executable: 'd.exe', volume: 100, enabled: true },
      ],
    });
    // Se conservan las 4 en la lista; solo cambia el enabled de la que sobra.
    expect(result.audioApps.map((a) => [a.executable, a.enabled])).toEqual([
      ['a.exe', true],
      ['b.exe', true],
      ['c.exe', true],
      ['d.exe', false],
    ]);
    expect(AUDIO_APPS_TRACK_MAX).toBe(3);
  });

  it('el tope respeta el orden de pista: las fijas (Discord) van primero', () => {
    // Discord está al final de la lista pero es fija → cuenta como la 1.ª activa; sobra 'z.exe'.
    const result = normalizeCaptureSettings({
      audioApps: [
        { executable: 'x.exe', volume: 100, enabled: true },
        { executable: 'y.exe', volume: 100, enabled: true },
        { executable: 'z.exe', volume: 100, enabled: true },
        { executable: 'Discord.exe', volume: 100, enabled: true },
      ],
    });
    const enabled = new Map(result.audioApps.map((a) => [a.executable, a.enabled]));
    // Discord (fija) + x + y ocupan las 3 pistas; z queda fuera.
    expect(enabled.get('Discord.exe')).toBe(true);
    expect(enabled.get('x.exe')).toBe(true);
    expect(enabled.get('y.exe')).toBe(true);
    expect(enabled.get('z.exe')).toBe(false);
  });
});

describe('normalizeCaptureSettings — juegos manuales', () => {
  it('migra la forma vieja (array de strings) sin perder los juegos ya dados de alta', () => {
    const { customGames } = normalizeCaptureSettings({
      customGames: ['ACBlackFlag.exe', 'MilesMorales.exe'],
    });
    expect(customGames).toEqual([
      { executable: 'ACBlackFlag.exe' },
      { executable: 'MilesMorales.exe' },
    ]);
  });

  it('acepta la forma nueva, con nombre opcional', () => {
    const { customGames } = normalizeCaptureSettings({
      customGames: [
        { executable: 'MilesMorales.exe', name: 'Spiderman' },
        { executable: 'MiJuego.exe' },
      ],
    });
    expect(customGames).toEqual([
      { executable: 'MilesMorales.exe', name: 'Spiderman' },
      { executable: 'MiJuego.exe' },
    ]);
  });

  it('un nombre vacío o en blanco es como no tener nombre', () => {
    const { customGames } = normalizeCaptureSettings({
      customGames: [{ executable: 'MiJuego.exe', name: '   ' }],
    });
    expect(customGames).toEqual([{ executable: 'MiJuego.exe' }]);
  });

  it('deduplica por ejecutable (ignorando ruta, extensión y capitalización) y descarta basura', () => {
    const { customGames } = normalizeCaptureSettings({
      customGames: [
        { executable: 'MiJuego.exe', name: 'Bueno' },
        'MIJUEGO.EXE',
        'D:\\Games\\MiJuego\\MiJuego.exe',
        { executable: '   ' },
        42,
        null,
      ],
    });
    expect(customGames).toEqual([{ executable: 'MiJuego.exe', name: 'Bueno' }]);
  });
});

describe('orderedActiveAudioApps', () => {
  it('devuelve solo las activas, fijas primero, luego de usuario en su orden', () => {
    const apps = [
      { executable: 'opera.exe', volume: 100, enabled: true },
      { executable: 'Spotify.exe', volume: 100, enabled: false },
      { executable: 'Discord.exe', volume: 100, enabled: true },
    ];
    expect(orderedActiveAudioApps(apps)).toEqual(['Discord.exe', 'opera.exe']);
  });

  it('lista vacía si ninguna está activa', () => {
    expect(orderedActiveAudioApps([{ executable: 'x.exe', volume: 100, enabled: false }])).toEqual(
      [],
    );
  });

  it('normaliza PTT, supresión de ruido y aceleración por hardware', () => {
    const defaults = normalizeCaptureSettings({});
    expect(defaults.pttEnabled).toBe(false);
    expect(defaults.pttHotkey).toBe('F9');
    expect(defaults.noiseSuppressionEnabled).toBe(false);
    expect(defaults.hardwareAcceleration).toBe(true);

    expect(normalizeCaptureSettings({ pttHotkey: 'Mouse4' }).pttHotkey).toBe('Mouse4');
    // Tecla fuera de la lista blanca: cae al default.
    expect(normalizeCaptureSettings({ pttHotkey: 'Escape' }).pttHotkey).toBe('F9');
    expect(normalizeCaptureSettings({ hardwareAcceleration: 'no' }).hardwareAcceleration).toBe(
      true,
    );
  });

  it('acota replaySeconds al rango permitido y lo redondea', () => {
    expect(normalizeCaptureSettings({ replaySeconds: 1 }).replaySeconds).toBe(REPLAY_SECONDS_MIN);
    expect(normalizeCaptureSettings({ replaySeconds: 9999 }).replaySeconds).toBe(
      REPLAY_SECONDS_MAX,
    );
    expect(normalizeCaptureSettings({ replaySeconds: 45.6 }).replaySeconds).toBe(46);
  });
});
