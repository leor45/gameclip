import { describe, expect, it } from 'vitest';
import { buildFfmpegArgs } from '../export/ffmpeg-args';

const base = {
  inputPath: 'C:\\Videos\\GameClip\\clip.mp4',
  outputPath: 'C:\\Users\\Leo\\Desktop\\recorte.mp4',
  startSeconds: 3.5,
  endSeconds: 10,
} as const;

describe('buildFfmpegArgs — MP4', () => {
  it('recorta con -ss antes de -i y -t con la duración', () => {
    const args = buildFfmpegArgs({ ...base, format: 'mp4', quality: 'media' });

    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    expect(args[args.indexOf('-ss') + 1]).toBe('3.50');
    expect(args[args.indexOf('-t') + 1]).toBe('6.50');
    expect(args[args.indexOf('-i') + 1]).toBe(base.inputPath);
    expect(args[args.length - 1]).toBe(base.outputPath);
  });

  it('aplica el CRF del preset de calidad', () => {
    const alta = buildFfmpegArgs({ ...base, format: 'mp4', quality: 'alta' });
    const baja = buildFfmpegArgs({ ...base, format: 'mp4', quality: 'baja' });

    expect(alta[alta.indexOf('-crf') + 1]).toBe('18');
    expect(baja[baja.indexOf('-crf') + 1]).toBe('28');
    expect(alta).toContain('libx264');
    expect(alta).toContain('aac');
  });

  it('emite progreso por stdout', () => {
    const args = buildFfmpegArgs({ ...base, format: 'mp4', quality: 'media' });
    expect(args[args.indexOf('-progress') + 1]).toBe('pipe:1');
  });
});

describe('buildFfmpegArgs — pistas de audio marcadas', () => {
  it('sin selección deja que ffmpeg elija la pista (clips sin sondeo)', () => {
    const args = buildFfmpegArgs({ ...base, format: 'mp4', quality: 'media' });
    expect(args).not.toContain('-map');
    expect(args).not.toContain('-an');
  });

  it('una sola pista marcada se mapea directo, sin filtro', () => {
    const args = buildFfmpegArgs({ ...base, format: 'mp4', quality: 'media', audioTracks: [2] });

    expect(args[args.indexOf('-map') + 1]).toBe('0:v:0');
    expect(args.join(' ')).toContain('-map 0:v:0 -map 0:a:2');
    expect(args).not.toContain('-filter_complex');
  });

  it('varias pistas se suman con amix sin normalizar (como el mixer de libobs)', () => {
    const args = buildFfmpegArgs({
      ...base,
      format: 'mp4',
      quality: 'media',
      audioTracks: [1, 3],
    });

    expect(args[args.indexOf('-filter_complex') + 1]).toBe(
      '[0:a:1][0:a:3]amix=inputs=2:normalize=0:duration=longest[aout]',
    );
    expect(args.join(' ')).toContain('-map 0:v:0 -map [aout]');
  });

  it('sin ninguna pista marcada, el MP4 sale sin audio', () => {
    const args = buildFfmpegArgs({ ...base, format: 'mp4', quality: 'media', audioTracks: [] });

    expect(args).toContain('-an');
    expect(args).not.toContain('aac');
  });
});

describe('buildFfmpegArgs — GIF', () => {
  it('usa paleta optimizada y fps/ancho del preset', () => {
    const args = buildFfmpegArgs({ ...base, format: 'gif', quality: 'media' });
    const filtro = args[args.indexOf('-filter_complex') + 1];

    expect(filtro).toContain('fps=15');
    expect(filtro).toContain('scale=480:-1');
    expect(filtro).toContain('palettegen');
    expect(filtro).toContain('paletteuse');
    expect(args).not.toContain('libx264');
  });

  it('preset baja reduce fps y ancho', () => {
    const args = buildFfmpegArgs({ ...base, format: 'gif', quality: 'baja' });
    const filtro = args[args.indexOf('-filter_complex') + 1];

    expect(filtro).toContain('fps=10');
    expect(filtro).toContain('scale=320:-1');
  });
});
