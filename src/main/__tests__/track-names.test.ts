import { describe, expect, it } from 'vitest';
import { buildTrackNameArgs } from '../capture/track-names';

describe('buildTrackNameArgs', () => {
  it('mapea las pistas (ordenadas por índice) a los streams de audio a:0.. con title+handler', () => {
    const args = buildTrackNameArgs('in.mp4', 'out.mp4', [
      { index: 2, name: 'game' },
      { index: 1, name: 'default' },
      { index: 3, name: 'mic' },
    ]);
    expect(args).toEqual([
      '-y',
      '-i',
      'in.mp4',
      '-map',
      '0',
      '-c',
      'copy',
      '-metadata:s:a:0',
      'title=default',
      '-metadata:s:a:0',
      'handler_name=default',
      '-metadata:s:a:1',
      'title=game',
      '-metadata:s:a:1',
      'handler_name=game',
      '-metadata:s:a:2',
      'title=mic',
      '-metadata:s:a:2',
      'handler_name=mic',
      'out.mp4',
    ]);
  });

  it('copia streams sin recodificar (-c copy)', () => {
    const args = buildTrackNameArgs('in.mp4', 'out.mp4', [{ index: 1, name: 'default' }]);
    expect(args).toContain('-c');
    expect(args).toContain('copy');
    expect(args).not.toContain('-c:a');
  });
});
