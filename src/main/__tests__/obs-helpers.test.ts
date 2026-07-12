import { describe, expect, it } from 'vitest';
import { DEFAULT_CAPTURE_SETTINGS } from '@shared/capture';
import {
  DESKTOP_AUDIO_SETTINGS,
  ObsCapture,
  appTrackName,
  audioTrackLayout,
  computePipelineSizes,
  encoderFamily,
  encoderRateControlSettings,
  faderDeflection,
  monitorCaptureSettings,
  resolveMonitorId,
} from '../capture/obs';

// Items reales de la propiedad `monitor_id` en la máquina del bug (probe 2026-07-11).
const REAL_ITEMS = [
  { name: 'Auto', value: 'Auto' },
  {
    name: 'ASUS VG24VQE: 1080x1920 @ -1080,-208',
    value: '\\\\?\\DISPLAY#AUS2406#5&1584ecd8&7&UID4357#{e6f07b5f}',
  },
  {
    name: 'MO27Q28G: 2560x1440 @ 0,0 (Monitor principal)',
    value: '\\\\?\\DISPLAY#GBT273C#5&1584ecd8&7&UID4353#{e6f07b5f}',
  },
];

describe('resolveMonitorId', () => {
  it('regresión: elige el display por tamaño+posición (el bug grababa el monitor equivocado)', () => {
    // El owner eligió el display de Electron índice 1 (MO27Q28G); con la key legacy
    // `monitor` libobs capturaba el ASUS vertical. El id resuelto debe ser el del MO27Q28G.
    expect(resolveMonitorId(REAL_ITEMS, { width: 2560, height: 1440, x: 0, y: 0 })).toBe(
      '\\\\?\\DISPLAY#GBT273C#5&1584ecd8&7&UID4353#{e6f07b5f}',
    );
    expect(resolveMonitorId(REAL_ITEMS, { width: 1080, height: 1920, x: -1080, y: -208 })).toBe(
      '\\\\?\\DISPLAY#AUS2406#5&1584ecd8&7&UID4357#{e6f07b5f}',
    );
  });

  it('sin match exacto, la posición sola decide (tamaño reportado con DPI raro)', () => {
    expect(resolveMonitorId(REAL_ITEMS, { width: 1728, height: 3072, x: -1080, y: -208 })).toBe(
      '\\\\?\\DISPLAY#AUS2406#5&1584ecd8&7&UID4357#{e6f07b5f}',
    );
  });

  it('sin match de posición, el tamaño decide solo si es inequívoco', () => {
    expect(resolveMonitorId(REAL_ITEMS, { width: 2560, height: 1440, x: 999, y: 999 })).toBe(
      '\\\\?\\DISPLAY#GBT273C#5&1584ecd8&7&UID4353#{e6f07b5f}',
    );
    // Dos monitores idénticos en posiciones que no cuadran: ambiguo → Auto.
    const gemelos = [
      { name: 'X: 1920x1080 @ 0,0', value: 'id-a' },
      { name: 'X: 1920x1080 @ 1920,0', value: 'id-b' },
    ];
    expect(resolveMonitorId(gemelos, { width: 1920, height: 1080, x: 5000, y: 0 })).toBe('Auto');
  });

  it('sin items o con nombres no parseables cae a Auto (nunca peor que hoy)', () => {
    expect(resolveMonitorId([], { width: 2560, height: 1440, x: 0, y: 0 })).toBe('Auto');
    expect(
      resolveMonitorId([{ name: 'Auto', value: 'Auto' }, { name: 'monitor raro', value: 'id-x' }], {
        width: 2560,
        height: 1440,
        x: 0,
        y: 0,
      }),
    ).toBe('Auto');
  });
});

describe('monitorCaptureSettings', () => {
  it('regresión: método WGC siempre y sin la key legacy `monitor`', () => {
    // DXGI entrega frames negros sin error en setups modernos (HAGS); y la key `monitor`
    // indexa con la enumeración de libobs (≠ Electron) — el monitor va por monitor_id.
    const s = monitorCaptureSettings(DEFAULT_CAPTURE_SETTINGS);
    expect(s).toMatchObject({ method: 2 });
    expect(s).not.toHaveProperty('monitor');
  });

  it('respeta el ajuste de cursor', () => {
    expect(
      monitorCaptureSettings({ ...DEFAULT_CAPTURE_SETTINGS, showMouseCursor: true }),
    ).toMatchObject({ capture_cursor: true });
  });
});

describe('DESKTOP_AUDIO_SETTINGS', () => {
  it('regresión: el loopback de escritorio usa el reloj del OS (use_device_timing false)', () => {
    // Con el reloj del dispositivo, las salidas HDMI/DP en reposo acumulan lag y libobs
    // descarta TODO el audio ("audio is lagging ... at max audio buffering").
    expect(DESKTOP_AUDIO_SETTINGS).toMatchObject({ use_device_timing: false });
  });
});

// Fake mínimo de osn para auditar cómo buildAudioSources configura las fuentes de audio.
function fakeOsnAudio() {
  const volumeSets: { name: string; value: number }[] = [];
  const faders: { attachedTo: string | null; deflection: number }[] = [];
  const makeInput = (name: string) => {
    const input = {
      name,
      muted: false,
      audioMixers: 0,
      release() {},
      update() {},
      addFilter() {},
      removeFilter() {},
      properties: { first: () => null, get: () => null, count: () => 0 },
    };
    // El setter volume de osn está roto (silencia la fuente): el fake lo registra para
    // poder afirmar que NADIE lo llama.
    Object.defineProperty(input, 'volume', {
      set(value: number) {
        volumeSets.push({ name, value });
      },
      get: () => 1,
    });
    return input;
  };
  const osn = {
    InputFactory: { create: (_id: string, name: string) => makeInput(name) },
    FilterFactory: { create: () => ({ release() {} }) },
    AudioTrackFactory: {
      create: () => ({ bitrate: 160, name: '' }),
      setAtIndex: () => {},
    },
    FaderFactory: {
      create: () => {
        const fader = {
          attachedTo: null as string | null,
          deflection: 0,
          attach(input: { name: string }) {
            this.attachedTo = input.name;
          },
          detach() {},
          destroy() {},
        };
        faders.push(fader);
        return fader;
      },
    },
  };
  return { osn, volumeSets, faders };
}

type BuildAudioSources = {
  buildAudioSources(
    osn: unknown,
    settings: unknown,
    gameExecutable: string | null,
    setSource: (src: unknown) => void,
  ): number;
};

describe('volumen por fader', () => {
  it('regresión: buildAudioSources nunca usa el setter volume (silencia la fuente) y ata un fader por fuente', () => {
    const { osn, volumeSets, faders } = fakeOsnAudio();
    const capture = new ObsCapture() as unknown as BuildAudioSources;
    const mask = capture.buildAudioSources(
      osn,
      { ...DEFAULT_CAPTURE_SETTINGS, separateAudioTracks: false },
      null,
      () => {},
    );
    // El bug: volume=1 (y cualquier valor) deja la fuente wasapi en silencio digital.
    expect(volumeSets).toEqual([]);
    // Volumen 100 % → deflection 1 (0 dB), un fader por fuente (mic + escritorio).
    expect(faders.map((f) => [f.attachedTo, f.deflection])).toEqual([
      ['gameclip-mic', 1],
      ['gameclip-audio', 1],
    ]);
    expect(mask).toBe(0b001);
  });

  it('faderDeflection clampa 0..100 → 0..1 y cae a 1 con valores no finitos', () => {
    expect(faderDeflection(100)).toBe(1);
    expect(faderDeflection(80)).toBe(0.8);
    expect(faderDeflection(0)).toBe(0);
    expect(faderDeflection(250)).toBe(1);
    expect(faderDeflection(Number.NaN)).toBe(1);
  });
});

describe('appTrackName', () => {
  it('quita la ruta y la extensión .exe, respetando el nombre', () => {
    expect(appTrackName('Discord.exe')).toBe('Discord');
    expect(appTrackName('opera.exe')).toBe('opera');
    expect(appTrackName('C:\\Program Files\\Foo\\Bar.EXE')).toBe('Bar');
    expect(appTrackName('sin-extension')).toBe('sin-extension');
  });
});

describe('audioTrackLayout', () => {
  it('modo apps + separadas: T1 default, T2 game, T3 mic, T4+ apps en orden', () => {
    const layout = audioTrackLayout('apps', true, ['Discord.exe', 'opera.exe']);
    // Cada fuente OR el bit de la pista 1 (mezcla) + su pista de rol.
    expect(layout.gameMask).toBe(0b000011); // T1 + T2
    expect(layout.micMask).toBe(0b000101); // T1 + T3
    expect(layout.appMasks).toEqual([0b001001, 0b010001]); // T1+T4, T1+T5
    expect(layout.tracks).toEqual([
      { index: 1, name: 'default' },
      { index: 2, name: 'game' },
      { index: 3, name: 'mic' },
      { index: 4, name: 'Discord' },
      { index: 5, name: 'opera' },
    ]);
    expect(layout.mixer).toBe(0b011111); // OR de las 5 pistas
    expect(layout.named).toBe(true);
  });

  it('reserva T2/T3 aunque no haya apps activas (slots fijos)', () => {
    const layout = audioTrackLayout('apps', true, []);
    expect(layout.tracks).toEqual([
      { index: 1, name: 'default' },
      { index: 2, name: 'game' },
      { index: 3, name: 'mic' },
    ]);
    expect(layout.mixer).toBe(0b000111);
  });

  it('toda máscara incluye el bit de la pista 1 (la mezcla nunca se rompe)', () => {
    const layout = audioTrackLayout('apps', true, ['a.exe', 'b.exe', 'c.exe']);
    expect(layout.gameMask & 0b1).toBe(0b1);
    expect(layout.micMask & 0b1).toBe(0b1);
    for (const m of layout.appMasks) expect(m & 0b1).toBe(0b1);
    // Tope de 3 pistas de app: no se asignan más de 3 aunque lleguen más.
    expect(layout.appMasks).toHaveLength(3);
    expect(layout.mixer).toBe(0b111111); // las 6 pistas
  });

  it('modo desktop + separadas: plan actual (T1 mezcla + T2 mic), sin nombres', () => {
    const layout = audioTrackLayout('desktop', true, []);
    expect(layout.desktopMask).toBe(0b001);
    expect(layout.micMask).toBe(0b011);
    expect(layout.mixer).toBe(0b011);
    expect(layout.named).toBe(false);
  });

  it('sin pistas separadas: todo a la pista 1 en cualquier modo (regresión)', () => {
    for (const mode of ['desktop', 'apps'] as const) {
      const layout = audioTrackLayout(mode, false, ['a.exe']);
      expect(layout.desktopMask).toBe(0b001);
      expect(layout.micMask).toBe(0b001);
      expect(layout.gameMask).toBe(0b001);
      expect(layout.appMasks).toEqual([0b001]);
      expect(layout.mixer).toBe(0b001);
      expect(layout.named).toBe(false);
    }
  });
});

describe('encoderFamily', () => {
  it('clasifica los ids de encoder por familia', () => {
    expect(encoderFamily('obs_x264')).toBe('x264');
    expect(encoderFamily('obs_qsv11_v2')).toBe('qsv');
    expect(encoderFamily('h264_texture_amf')).toBe('amf');
    expect(encoderFamily('jim_nvenc')).toBe('nvenc');
    expect(encoderFamily('obs_nvenc_h264_tex')).toBe('nvenc');
  });
});

describe('encoderRateControlSettings', () => {
  it('con bitrate manual usa CBR en kbps (misma key en x264 y HW)', () => {
    expect(encoderRateControlSettings('obs_x264', 'high', 25)).toEqual({
      rate_control: 'CBR',
      bitrate: 25000,
    });
    expect(encoderRateControlSettings('jim_nvenc', 'lossless', 50)).toEqual({
      rate_control: 'CBR',
      bitrate: 50000,
    });
  });

  it('x264 en automático usa CRF (23/18/0)', () => {
    expect(encoderRateControlSettings('obs_x264', 'high', 0)).toEqual({
      rate_control: 'CRF',
      crf: 23,
    });
    expect(encoderRateControlSettings('obs_x264', 'higher', 0)).toEqual({
      rate_control: 'CRF',
      crf: 18,
    });
    expect(encoderRateControlSettings('obs_x264', 'lossless', 0)).toEqual({
      rate_control: 'CRF',
      crf: 0,
    });
  });

  it('encoders HW en automático usan CQP (23/20 y QP 0 para sin pérdida)', () => {
    expect(encoderRateControlSettings('jim_nvenc', 'high', 0)).toEqual({
      rate_control: 'CQP',
      cqp: 23,
    });
    expect(encoderRateControlSettings('h264_texture_amf', 'higher', 0)).toEqual({
      rate_control: 'CQP',
      cqp: 20,
    });
    // 'Sin pérdida' debe serlo también en HW: QP 0, no un CQP intermedio lossy.
    expect(encoderRateControlSettings('obs_qsv11_v2', 'lossless', 0)).toEqual({
      rate_control: 'CQP',
      cqp: 0,
    });
  });
});

describe('computePipelineSizes', () => {
  const screen = { width: 2560, height: 1440 };

  it("'game' native: lienzo y salida = monitor", () => {
    expect(computePipelineSizes('native', 'game', screen)).toEqual({
      baseWidth: 2560,
      baseHeight: 1440,
      outputWidth: 2560,
      outputHeight: 1440,
      boundsType: null,
    });
  });

  it("'game' 1080p: salida escalada manteniendo el ratio del monitor", () => {
    expect(computePipelineSizes('1080p', 'game', screen)).toEqual({
      baseWidth: 2560,
      baseHeight: 1440,
      outputWidth: 1920,
      outputHeight: 1080,
      boundsType: null,
    });
  });

  it("'game' 1080p en un monitor 1080p: no reescala (no ampliar)", () => {
    expect(computePipelineSizes('1080p', 'game', { width: 1920, height: 1080 })).toEqual({
      baseWidth: 1920,
      baseHeight: 1080,
      outputWidth: 1920,
      outputHeight: 1080,
      boundsType: null,
    });
  });

  it("'stretch169': lienzo = monitor, salida 16:9 (libobs estira)", () => {
    const uw = { width: 3440, height: 1440 };
    expect(computePipelineSizes('native', 'stretch169', uw)).toEqual({
      baseWidth: 3440,
      baseHeight: 1440,
      outputWidth: 2560, // 1440*16/9
      outputHeight: 1440,
      boundsType: null,
    });
  });

  it("'bars169': lienzo 16:9 y bounds SCALE_INNER (barras)", () => {
    const uw = { width: 3440, height: 1440 };
    expect(computePipelineSizes('native', 'bars169', uw)).toEqual({
      baseWidth: 2560, // 1440*16/9
      baseHeight: 1440,
      outputWidth: 2560,
      outputHeight: 1440,
      boundsType: 'inner',
    });
  });

  it("'crop169' 1080p: lienzo 16:9 (alto del monitor) y bounds SCALE_OUTER (recorte)", () => {
    const uw = { width: 3440, height: 1440 };
    expect(computePipelineSizes('1080p', 'crop169', uw)).toEqual({
      baseWidth: 2560, // lienzo a la altura del monitor
      baseHeight: 1440,
      outputWidth: 1920, // salida 1080p 16:9
      outputHeight: 1080,
      boundsType: 'outer',
    });
  });
});
