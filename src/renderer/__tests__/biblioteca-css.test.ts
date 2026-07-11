import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom no calcula layout: la regresión se fija sobre la hoja de estilos real, igual que
// el fix del CSP se fijó sobre index.html. Extrae el cuerpo de una regla por su selector.
const css = readFileSync(join(__dirname, '..', 'styles.css'), 'utf8');
function rule(selector: string): string {
  const re = new RegExp(`${selector.replace(/[.\\s]/g, (c) => (c === '.' ? '\\.' : '\\s+'))}\\s*\\{([^}]*)\\}`);
  const m = re.exec(css);
  if (!m) throw new Error(`No existe la regla '${selector}' en styles.css`);
  return m[1];
}

describe('Biblioteca: cards uniformes (regresión)', () => {
  it('la imagen del thumb va absoluta y con contain: fuera del flujo, no dicta la altura de la card', () => {
    // Con la imagen en el flujo, height:100% resolvía a auto y un thumbnail 9:16
    // estiraba la card (el aspect-ratio del contenedor cede ante el contenido).
    const img = rule('.clip-thumb img');
    expect(img).toMatch(/position:\s*absolute/);
    expect(img).toMatch(/inset:\s*0/);
    expect(img).toMatch(/object-fit:\s*contain/);
  });

  it('el thumb conserva el marco fijo 16:9 (aspect-ratio + relative para anclar la imagen)', () => {
    const thumb = rule('.clip-thumb');
    expect(thumb).toMatch(/aspect-ratio:\s*16\s*\/\s*9/);
    expect(thumb).toMatch(/position:\s*relative/);
  });
});
