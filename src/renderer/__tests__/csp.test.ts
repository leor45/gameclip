import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Regresión del reproductor interno: el CSP de index.html tenía default-src 'self' sin
// permitir el scheme gameclip-media:, y Chromium bloqueaba el <video> del reproductor
// ("Media load rejected by URL safety check") y las miniaturas <img> de la biblioteca.
describe('CSP de la app', () => {
  const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
  const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? '';

  function directiva(nombre: string): string {
    return (
      csp
        .split(';')
        .map((d) => d.trim())
        .find((d) => d.startsWith(`${nombre} `)) ?? ''
    );
  }

  it('permite gameclip-media: en media-src (reproductor y editor)', () => {
    expect(directiva('media-src')).toContain('gameclip-media:');
  });

  it('permite gameclip-media: en img-src (miniaturas de la biblioteca)', () => {
    expect(directiva('img-src')).toContain('gameclip-media:');
  });
});
