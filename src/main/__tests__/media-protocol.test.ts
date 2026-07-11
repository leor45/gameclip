import { describe, expect, it } from 'vitest';
import { MEDIA_SCHEME, MEDIA_SCHEME_PRIVILEGES } from '../media-protocol';

describe('privilegios del scheme de medios', () => {
  it('mantiene secure+stream (necesarios para servir <video> por protocolo custom)', () => {
    expect(MEDIA_SCHEME).toBe('gameclip-media');
    expect(MEDIA_SCHEME_PRIVILEGES.secure).toBe(true);
    expect(MEDIA_SCHEME_PRIVILEGES.stream).toBe(true);
  });
});
