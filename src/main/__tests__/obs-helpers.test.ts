import { describe, expect, it } from 'vitest';
import {
  DESKTOP_AUDIO_SETTINGS,
  audioTrackPlan,
  computePipelineSizes,
  encoderFamily,
  encoderRateControlSettings,
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

describe('DESKTOP_AUDIO_SETTINGS', () => {
  it('regresión: el loopback de escritorio usa el reloj del OS (use_device_timing false)', () => {
    // Con el reloj del dispositivo, las salidas HDMI/DP en reposo acumulan lag y libobs
    // descarta TODO el audio ("audio is lagging ... at max audio buffering").
    expect(DESKTOP_AUDIO_SETTINGS).toMatchObject({ use_device_timing: false });
  });
});

describe('audioTrackPlan', () => {
  it('sin tracks separados: todo a la pista 1', () => {
    expect(audioTrackPlan(false)).toEqual({
      desktopMask: 0b001,
      micMask: 0b001,
      appsMask: 0b001,
    });
  });

  it('con tracks separados la pista 1 SIEMPRE lleva la mezcla completa (regresión: los reproductores solo reproducen la primera pista)', () => {
    const plan = audioTrackPlan(true);
    // mic → pistas 1+2 · apps → pistas 1+3 · juego/escritorio → pista 1.
    expect(plan.desktopMask).toBe(0b001);
    expect(plan.micMask).toBe(0b011);
    expect(plan.appsMask).toBe(0b101);
    // Invariante de la regresión: toda máscara incluye el bit de la pista 1.
    expect(plan.micMask & 0b001).toBe(0b001);
    expect(plan.appsMask & 0b001).toBe(0b001);
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
