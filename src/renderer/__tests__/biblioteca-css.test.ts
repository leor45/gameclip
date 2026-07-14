import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom no calcula layout: la regresión se fija sobre la hoja de estilos real, igual que
// el fix del CSP se fijó sobre index.html. Devuelve el cuerpo de la regla que aplica al selector
// (puede estar agrupado con otros: `.clip-thumb img, .clip-preview { … }`).
// Sin comentarios: si no, el texto previo a una regla se cuela en su lista de selectores.
const css = readFileSync(join(__dirname, '..', 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
function rule(selector: string): string {
  const normalizar = (s: string) => s.trim().replace(/\s+/g, ' ');
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectores = m[1].split(',').map(normalizar);
    if (selectores.includes(normalizar(selector))) return m[2];
  }
  throw new Error(`No existe la regla '${selector}' en styles.css`);
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

  it('la preview en hover ocupa el MISMO marco que la imagen (no puede estirar la card)', () => {
    const preview = rule('.clip-preview');
    expect(preview).toMatch(/position:\s*absolute/);
    expect(preview).toMatch(/inset:\s*0/);
    expect(preview).toMatch(/object-fit:\s*contain/);
  });
});

describe('Ajustes: el alta de juego no desborda (regresión)', () => {
  // El bug: el <select> de "Proceso en ejecución" tiene opciones larguísimas
  // (ejecutable — título de ventana). Sin min-width:0 el flex-item no encoge y la fila se sale
  // del panel ("se estira a la derecha"). El fix es que el label pueda encoger.
  it('.audio-app-add label puede encoger (min-width: 0)', () => {
    expect(rule('.audio-app-add label')).toMatch(/min-width:\s*0/);
  });
});
