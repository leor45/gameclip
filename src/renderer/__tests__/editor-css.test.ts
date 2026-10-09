import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { waveTone } from '../components/editor-avanzado/Waveform';

// jsdom no calcula layout ni cascada real: se fija sobre la hoja de estilos, como biblioteca-css.test.ts.
const css = readFileSync(join(__dirname, '..', 'styles', 'editor.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);
function rule(selector: string): string {
  const normalizar = (s: string) => s.trim().replace(/\s+/g, ' ');
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (m[1].split(',').map(normalizar).includes(normalizar(selector))) return m[2];
  }
  throw new Error(`No existe la regla '${selector}' en editor.css`);
}

describe('Editor: títulos que `.app-content h1` (0,1,1) no debe pisar', () => {
  it('el h1 de la barra del avanzado fija margen 0 y 22 px con mayor especificidad', () => {
    const r = rule('.app-content h1.eav-topbar-name');
    expect(r).toMatch(/margin:\s*0/);
    expect(r).toMatch(/font-size:\s*22px/);
  });

  it('el h1 «Editor» de la vista sin clip deja 18 px de separación con mayor especificidad', () => {
    expect(rule('.app-content .editor-page > h1.editor-title')).toMatch(/margin-bottom:\s*18px/);
  });
});

describe('Ondas: color por rol desde los tokens', () => {
  it('juego/PC en --paper, micrófono en --sello y el resto en un gris derivado de --dim', () => {
    expect(rule(".waveform-canvas[data-tone='game']")).toMatch(/--wave:\s*var\(--paper\)/);
    expect(rule(".waveform-canvas[data-tone='mic']")).toMatch(/--wave:\s*var\(--sello\)/);
    expect(rule('.waveform-canvas')).toMatch(/--wave:[^;]*var\(--dim\)/);
  });

  it('waveTone asigna el rol según la clave de la pista', () => {
    expect(waveTone('game')).toBe('game');
    expect(waveTone('pc')).toBe('game');
    expect(waveTone('mic')).toBe('mic');
    expect(waveTone('discord')).toBe('other');
    expect(waveTone('pista-3')).toBe('other');
  });
});
