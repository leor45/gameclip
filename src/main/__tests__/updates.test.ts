import { describe, expect, it, vi } from 'vitest';
import { checkForUpdates } from '../updates';

const RELEASES_PAGE = 'https://github.com/leor45/gameclip/releases/latest';

describe('checkForUpdates', () => {
  it('detecta una versión más nueva y devuelve latest + url', async () => {
    const result = await checkForUpdates('0.5.1', {
      fetchLatest: () =>
        Promise.resolve({
          tag_name: 'v0.6.0',
          html_url: 'https://github.com/leor45/gameclip/releases/tag/v0.6.0',
        }),
    });
    expect(result).toEqual({
      current: '0.5.1',
      latest: '0.6.0',
      updateAvailable: true,
      url: 'https://github.com/leor45/gameclip/releases/tag/v0.6.0',
    });
  });

  it('misma versión → sin update', async () => {
    const result = await checkForUpdates('0.6.0', {
      fetchLatest: () => Promise.resolve({ tag_name: 'v0.6.0', html_url: RELEASES_PAGE }),
    });
    expect(result.updateAvailable).toBe(false);
    expect(result.latest).toBe('0.6.0');
  });

  it('versión instalada más nueva que el release → sin update', async () => {
    const result = await checkForUpdates('0.7.0', {
      fetchLatest: () => Promise.resolve({ tag_name: 'v0.6.0', html_url: RELEASES_PAGE }),
    });
    expect(result.updateAvailable).toBe(false);
  });

  it('un fallo de red no lanza: sin update y url de la página de releases', async () => {
    const result = await checkForUpdates('0.5.1', {
      fetchLatest: () => Promise.reject(new Error('offline')),
    });
    expect(result).toEqual({
      current: '0.5.1',
      latest: null,
      updateAvailable: false,
      url: RELEASES_PAGE,
    });
  });

  it('JSON sin tag_name → sin update, pero conserva la url si viene', async () => {
    const result = await checkForUpdates('0.5.1', {
      fetchLatest: () => Promise.resolve({ html_url: 'https://github.com/leor45/gameclip/releases' }),
    });
    expect(result.updateAvailable).toBe(false);
    expect(result.latest).toBeNull();
    expect(result.url).toBe('https://github.com/leor45/gameclip/releases');
  });

  it('respuesta null → sin update sin lanzar', async () => {
    const fetchLatest = vi.fn().mockResolvedValue(null);
    const result = await checkForUpdates('0.5.1', { fetchLatest });
    expect(result.updateAvailable).toBe(false);
    expect(fetchLatest).toHaveBeenCalledOnce();
  });
});
