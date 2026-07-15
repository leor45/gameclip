import { describe, expect, it } from 'vitest';
import { editReducer, initEditState } from '../editor-avanzado-edit';

const A = [{ start: 0, end: 10 }];
const B = [
  { start: 0, end: 4 },
  { start: 4, end: 10 },
];
const C = [{ start: 0, end: 4 }];

describe('editReducer', () => {
  it('commit empuja el estado anterior al historial y vacía el futuro', () => {
    let s = initEditState(A);
    s = editReducer(s, { type: 'commit', segments: B });
    expect(s.segments).toBe(B);
    expect(s.past).toEqual([A]);
    expect(s.future).toEqual([]);
  });

  it('commit idéntico no genera un paso de historial', () => {
    let s = initEditState(A);
    s = editReducer(s, { type: 'commit', segments: [{ start: 0, end: 10 }] });
    expect(s.past).toEqual([]);
  });

  it('undo y redo mueven entre las pilas', () => {
    let s = initEditState(A);
    s = editReducer(s, { type: 'commit', segments: B });
    s = editReducer(s, { type: 'undo' });
    expect(s.segments).toBe(A);
    expect(s.future).toEqual([B]);
    s = editReducer(s, { type: 'redo' });
    expect(s.segments).toBe(B);
    expect(s.future).toEqual([]);
  });

  it('undo/redo sin nada en la pila no cambian el estado', () => {
    const s = initEditState(A);
    expect(editReducer(s, { type: 'undo' })).toBe(s);
    expect(editReducer(s, { type: 'redo' })).toBe(s);
  });

  it('un arrastre de borde es un solo paso de historial (beginDrag → live → endDrag)', () => {
    let s = initEditState(A);
    s = editReducer(s, { type: 'beginDrag' });
    s = editReducer(s, { type: 'live', segments: [{ start: 0, end: 8 }] });
    s = editReducer(s, { type: 'live', segments: C });
    s = editReducer(s, { type: 'endDrag' });
    expect(s.segments).toBe(C);
    expect(s.past).toEqual([A]); // un único paso, no uno por movimiento
    expect(s.dragBase).toBeNull();
  });

  it('un arrastre que no cambia nada no deja paso de historial', () => {
    let s = initEditState(A);
    s = editReducer(s, { type: 'beginDrag' });
    s = editReducer(s, { type: 'live', segments: [{ start: 0, end: 10 }] });
    s = editReducer(s, { type: 'endDrag' });
    expect(s.past).toEqual([]);
  });

  it('reset limpia el historial', () => {
    let s = initEditState(A);
    s = editReducer(s, { type: 'commit', segments: B });
    s = editReducer(s, { type: 'reset', segments: C });
    expect(s).toEqual({ segments: C, past: [], future: [], dragBase: null });
  });
});
