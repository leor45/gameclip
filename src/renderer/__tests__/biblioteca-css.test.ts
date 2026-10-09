import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom no calcula layout: la regresión se fija sobre la hoja de estilos real, igual que
// el fix del CSP se fijó sobre index.html. Devuelve el cuerpo de la regla que aplica al selector
// (puede estar agrupado con otros: `.clip-thumb img, .clip-preview { … }`).
// Sin comentarios: si no, el texto previo a una regla se cuela en su lista de selectores.
// Cada área tiene su hoja (rediseño «Portada oscura»): la Biblioteca vive en styles/library.css.
function leer(...ruta: string[]): string {
  return readFileSync(join(__dirname, '..', ...ruta), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}
const hojas = {
  'styles.css': leer('styles.css'),
  'styles/library.css': leer('styles', 'library.css'),
};
function rule(selector: string, hoja: keyof typeof hojas = 'styles.css'): string {
  const normalizar = (s: string) => s.trim().replace(/\s+/g, ' ');
  for (const m of hojas[hoja].matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectores = m[1].split(',').map(normalizar);
    if (selectores.includes(normalizar(selector))) return m[2];
  }
  throw new Error(`No existe la regla '${selector}' en ${hoja}`);
}
const lib = (selector: string) => rule(selector, 'styles/library.css');

describe('Biblioteca: cards uniformes (regresión)', () => {
  it('la imagen del thumb va absoluta y con contain: fuera del flujo, no dicta la altura de la card', () => {
    // Con la imagen en el flujo, height:100% resolvía a auto y un thumbnail 9:16
    // estiraba la card (el aspect-ratio del contenedor cede ante el contenido).
    const img = lib('.clip-thumb img');
    expect(img).toMatch(/position:\s*absolute/);
    expect(img).toMatch(/inset:\s*0/);
    expect(img).toMatch(/object-fit:\s*contain/);
  });

  it('el thumb conserva el marco fijo 16:9 (aspect-ratio + relative para anclar la imagen)', () => {
    const thumb = lib('.clip-thumb');
    expect(thumb).toMatch(/aspect-ratio:\s*16\s*\/\s*9/);
    expect(thumb).toMatch(/position:\s*relative/);
  });

  it('la preview en hover ocupa el MISMO marco que la imagen (no puede estirar la card)', () => {
    const preview = lib('.clip-preview');
    expect(preview).toMatch(/position:\s*absolute/);
    expect(preview).toMatch(/inset:\s*0/);
    expect(preview).toMatch(/object-fit:\s*contain/);
  });
});

describe('Biblioteca: rediseño «Portada oscura»', () => {
  it('las acciones de la tarjeta aparecen al apuntar Y con el foco del teclado', () => {
    // Ocultas con opacity (no visibility/display): siguen en el orden de tabulación y el foco
    // de teclado las destapa vía :focus-within.
    expect(lib('.clip-actions:not(.panel)')).toMatch(/opacity:\s*0/);
    const visibles = lib('.clip-card:focus-within .clip-actions');
    expect(visibles).toMatch(/opacity:\s*1/);
    expect(lib('.clip-card:hover .clip-actions')).toBe(visibles);
    expect(hojas['styles/library.css']).not.toMatch(/\.clip-actions[^{]*\{[^}]*(visibility:\s*hidden|display:\s*none)/);
  });

  it('la cabecera de cada grupo por fecha queda fija al hacer scroll', () => {
    const head = lib('.library-group-head');
    expect(head).toMatch(/position:\s*sticky/);
    expect(head).toMatch(/top:\s*0/);
    expect(head).toMatch(/background:/); // opaca: las tarjetas no se ven a través
  });

  it('el reproductor del panel muestra la imagen o el vídeo entero (contain)', () => {
    expect(lib('.lib-player-video')).toMatch(/object-fit:\s*contain/);
  });

  it('las reglas de la Biblioteca ya no viven en styles.css', () => {
    for (const sel of ['.clip-thumb', '.clip-card', '.library-grid', '.chip', '.player-video']) {
      expect(() => rule(sel)).toThrow();
    }
  });
});

describe('Ajustes: el alta de juego no desborda (regresión)', () => {
  // El bug de fondo: un <fieldset> ignora el ancho del padre (su min-width por defecto es
  // min-content), así que crece con su contenido (la fila de alta de juego) y desborda el form de
  // 460px. min-width:0 en el fieldset es lo que de verdad lo contiene. Verificado midiendo el
  // layout real en Chromium: sin esto, formScrollWidth = 706 (desborda); con esto, = 460.
  it('.settings-form fieldset puede encoger al ancho del form (min-width: 0)', () => {
    expect(rule('.settings-form fieldset')).toMatch(/min-width:\s*0/);
  });

  // Y el <select> con opciones larguísimas (ejecutable — título de ventana) encoge en su celda.
  it('.audio-app-add label puede encoger (min-width: 0)', () => {
    expect(rule('.audio-app-add label')).toMatch(/min-width:\s*0/);
  });
});
