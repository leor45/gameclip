import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom no calcula layout: las regresiones de Ajustes se fijan sobre su hoja de estilos real
// (styles/settings.css). Devuelve el cuerpo de la regla que aplica al selector (puede estar agrupado
// con otros). Sin comentarios: si no, el texto previo a una regla se cuela en su lista de selectores.
const css = readFileSync(join(__dirname, '..', 'styles', 'settings.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);
function rule(selector: string): string {
  const normalizar = (s: string) => s.trim().replace(/\s+/g, ' ');
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectores = m[1].split(',').map(normalizar);
    if (selectores.includes(normalizar(selector))) return m[2];
  }
  throw new Error(`No existe la regla '${selector}' en settings.css`);
}

describe('Ajustes: el alta de juego no desborda (regresión)', () => {
  // El bug de fondo: un <fieldset> ignora el ancho del padre (su min-width por defecto es
  // min-content), así que crece con su contenido (la fila de alta de juego) y desborda el form.
  // min-width:0 en el fieldset es lo que de verdad lo contiene (medido en Chromium real).
  it('.settings-form fieldset puede encoger al ancho del form (min-width: 0)', () => {
    expect(rule('.settings-form fieldset')).toMatch(/min-width:\s*0/);
  });

  // Y el <select> con opciones larguísimas (ejecutable — título de ventana) encoge en su celda.
  it('.settings-addrow label puede encoger (min-width: 0)', () => {
    expect(rule('.settings-addrow label')).toMatch(/min-width:\s*0/);
  });
});

describe('Ajustes: pie fijo con scroll propio', () => {
  it('el contenedor de la app no hace scroll con Ajustes abierto (solo el formulario)', () => {
    const regla = rule('.app-content:has(> .ajustes)');
    expect(regla).toMatch(/overflow:\s*hidden/);
    expect(regla).toMatch(/padding:\s*0/);
  });

  it('el área de campos hace scroll y puede encoger (min-height: 0)', () => {
    const regla = rule('.settings-scroll');
    expect(regla).toMatch(/overflow-y:\s*auto/);
    expect(regla).toMatch(/min-height:\s*0/);
    expect(regla).toMatch(/flex:\s*1/);
    // Contiene lo posicionado (.settings-sr, inputs de tarjetas): sin esto un absoluto 1×1 se salía
    // del scroll y daba barra de scroll a la ventana entera.
    expect(regla).toMatch(/position:\s*relative/);
  });

  it('el pie no encoge: «Guardar ajustes» queda siempre a la vista', () => {
    expect(rule('.settings-savebar')).toMatch(/flex:\s*none/);
  });
});

describe('Ajustes: filas «grupo | controles» solo en pantalla ancha', () => {
  const bloque = css.match(/@container ajustes \(min-width: (\d+)px\) \{([\s\S]*)\}\s*$/);

  it('el formulario es el contenedor que se mide (no la ventana)', () => {
    expect(rule('.settings-form')).toMatch(/container:\s*ajustes \/ inline-size/);
  });

  it('por debajo del umbral no cambia nada: las filas viven solo dentro de la container query', () => {
    expect(bloque).not.toBeNull();
    expect(Number(bloque![1])).toBeGreaterThanOrEqual(1100);
    expect(rule('.settings-form fieldset')).toMatch(/display:\s*flex/);
  });

  it('en ancho: grupo a la izquierda, controles a la derecha, a todo el ancho y pie alineado', () => {
    const dentro = bloque![2];
    expect(dentro).toMatch(
      /\.settings-form fieldset \{[^}]*grid-template-columns:\s*clamp\([^)]*\) minmax\(0, 1fr\)/,
    );
    expect(dentro).toMatch(/fieldset > legend \{[^}]*grid-column:\s*1/);
    expect(dentro).toMatch(/fieldset > :not\(legend\) \{[^}]*grid-column:\s*2/);
    // Sin tope de ancho ni centrado: el owner lo quiere a todo el ancho.
    expect(dentro).toMatch(/\.settings-body \{[^}]*max-width:\s*none/);
    expect(dentro).not.toMatch(/margin-inline:\s*auto/);
    const cuerpo = dentro.match(/\.settings-body \{[^}]*padding-inline:\s*(\d+)px/)?.[1];
    const pie = dentro.match(/\.settings-savebar \{[^}]*padding-inline:\s*(\d+)px/)?.[1];
    expect(cuerpo).toBeDefined();
    expect(pie).toBe(cuerpo);
  });
});
