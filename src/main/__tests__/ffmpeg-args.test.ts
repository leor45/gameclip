import { describe, expect, it } from 'vitest';
import { buildFfmpegArgs, gainMixFilter } from '../export/ffmpeg-args';

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

describe('gainMixFilter — volumen por pista (editor avanzado)', () => {
  it('una sola pista activa: volume directo, sin amix', () => {
    expect(gainMixFilter([{ index: 1, gain: 1.5 }], 'aout')).toBe('[0:a:1]volume=1.5[aout]');
  });

  it('varias pistas: volume por fuente y luego amix normalize=0', () => {
    expect(
      gainMixFilter([{ index: 1, gain: 1 }, { index: 2, gain: 0.5 }], 'aout'),
    ).toBe('[0:a:1]volume=1[g0];[0:a:2]volume=0.5[g1];[g0][g1]amix=inputs=2:normalize=0[aout]');
  });

  it('las pistas en 0 (muteadas) quedan fuera de la mezcla', () => {
    expect(
      gainMixFilter([{ index: 1, gain: 1 }, { index: 2, gain: 0 }, { index: 3, gain: 2 }], 'aout'),
    ).toBe('[0:a:1]volume=1[g0];[0:a:3]volume=2[g1];[g0][g1]amix=inputs=2:normalize=0[aout]');
  });

  it('sin pistas activas lanza (el llamador debe cortar a -an antes)', () => {
    expect(() => gainMixFilter([{ index: 1, gain: 0 }], 'aout')).toThrow(/activas/i);
  });
});

describe('buildFfmpegArgs — ganancias por pista', () => {
  it('mezcla con volumen por pista tiene precedencia y mapea [aout]', () => {
    const args = buildFfmpegArgs({
      ...base,
      format: 'mp4',
      quality: 'media',
      audioGains: [{ index: 1, gain: 1 }, { index: 2, gain: 0.5 }],
    });
    expect(args[args.indexOf('-filter_complex') + 1]).toContain('volume=0.5');
    expect(args.join(' ')).toContain('-map 0:v:0 -map [aout]');
    expect(args).toContain('aac');
  });

  it('todas las pistas en 0 → MP4 sin audio', () => {
    const args = buildFfmpegArgs({
      ...base,
      format: 'mp4',
      quality: 'media',
      audioGains: [{ index: 1, gain: 0 }, { index: 2, gain: 0 }],
    });
    expect(args).toContain('-an');
    expect(args).not.toContain('-filter_complex');
  });
});

describe('buildFfmpegArgs — cortes múltiples (concat, Fase 3)', () => {
  const segs = [
    { start: 0, end: 3 },
    { start: 6, end: 10 },
  ];

  it('un solo segmento mantiene la ruta rápida -ss/-t (sin concat)', () => {
    const args = buildFfmpegArgs({
      ...base,
      format: 'mp4',
      quality: 'media',
      segments: [{ start: 3.5, end: 10 }],
    });
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    expect(args.join(' ')).not.toContain('concat');
  });

  it('dos o más segmentos: split/trim de vídeo, asplit/atrim de audio y concat', () => {
    const args = buildFfmpegArgs({
      ...base,
      format: 'mp4',
      quality: 'media',
      segments: segs,
      audioGains: [
        { index: 1, gain: 1 },
        { index: 2, gain: 0.5 },
      ],
    });
    const graph = args[args.indexOf('-filter_complex') + 1];

    // Sin seek de input (el trim del filtro selecciona los rangos).
    expect(args).not.toContain('-ss');
    expect(graph).toContain('[0:v]split=2[vs0][vs1]');
    expect(graph).toContain('[vs0]trim=start=0.000:end=3.000,setpts=PTS-STARTPTS[v0]');
    expect(graph).toContain('[vs1]trim=start=6.000:end=10.000,setpts=PTS-STARTPTS[v1]');
    // La mezcla por ganancias se duplica y se recorta por segmento.
    expect(graph).toContain('[mixfull]asplit=2[as0][as1]');
    expect(graph).toContain('[as0]atrim=start=0.000:end=3.000,asetpts=PTS-STARTPTS[a0]');
    expect(graph).toContain('[v0][a0][v1][a1]concat=n=2:v=1:a=1[vout][aout]');
    expect(args.join(' ')).toContain('-map [vout] -map [aout]');
    expect(args).toContain('aac');
  });

  it('sin audio activo, concatena solo vídeo y sale con -an', () => {
    const args = buildFfmpegArgs({
      ...base,
      format: 'mp4',
      quality: 'media',
      segments: segs,
      audioGains: [
        { index: 1, gain: 0 },
        { index: 2, gain: 0 },
      ],
    });
    const graph = args[args.indexOf('-filter_complex') + 1];
    expect(graph).toContain('[v0][v1]concat=n=2:v=1:a=0[vout]');
    expect(graph).not.toContain('amix');
    expect(args).toContain('-an');
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
