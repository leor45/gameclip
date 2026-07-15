import { afterEach, describe, expect, it } from 'vitest';
import {
  clampPanelHeight,
  loadPanelHeight,
  PANEL_DEFAULT,
  PANEL_MIN,
  savePanelHeight,
} from '../editor-prefs';

const KEY = 'gameclip.editor.panelHeight';

afterEach(() => localStorage.clear());

describe('clampPanelHeight', () => {
  it('acota al rango [PANEL_MIN, max]', () => {
    expect(clampPanelHeight(300, 600)).toBe(300);
    expect(clampPanelHeight(50, 600)).toBe(PANEL_MIN); // por debajo del mínimo
    expect(clampPanelHeight(900, 600)).toBe(600); // por encima del máximo
  });

  it('un valor no finito cae al defecto (acotado al máximo)', () => {
    expect(clampPanelHeight(Number.NaN, 600)).toBe(PANEL_DEFAULT);
    expect(clampPanelHeight(Number.NaN, 200)).toBe(200); // defecto acotado a un máximo chico
  });
});

describe('loadPanelHeight / savePanelHeight', () => {
  it('sin nada guardado devuelve el defecto', () => {
    expect(loadPanelHeight()).toBe(PANEL_DEFAULT);
  });

  it('devuelve el valor guardado', () => {
    savePanelHeight(420);
    expect(localStorage.getItem(KEY)).toBe('420');
    expect(loadPanelHeight()).toBe(420);
  });

  it('un valor corrupto cae al defecto', () => {
    localStorage.setItem(KEY, 'no-es-un-numero');
    expect(loadPanelHeight()).toBe(PANEL_DEFAULT);
  });
});
