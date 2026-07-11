import { describe, expect, it } from 'vitest';
import {
  computePipelineSizes,
  encoderFamily,
  encoderRateControlSettings,
} from '../capture/obs';

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
