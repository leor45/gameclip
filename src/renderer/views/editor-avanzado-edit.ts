import type { Segment } from '@shared/timeline';

// Estado de edición del editor avanzado (Fase 3): los segmentos conservados + el historial para
// deshacer/rehacer. Puro y testeable (sin React). Solo los CORTES entran en el historial; el volumen
// por pista (continuo) se queda fuera a propósito.

export interface EditState {
  segments: Segment[];
  past: Segment[][];
  future: Segment[][];
  /** Snapshot al empezar un arrastre de borde: se confirma como un único paso al soltar. */
  dragBase: Segment[] | null;
}

export type EditAction =
  | { type: 'reset'; segments: Segment[] }
  | { type: 'commit'; segments: Segment[] } // operación discreta (dividir/borrar)
  | { type: 'live'; segments: Segment[] } // durante el arrastre: sin historial
  | { type: 'beginDrag' }
  | { type: 'endDrag' }
  | { type: 'undo' }
  | { type: 'redo' };

export function initEditState(segments: Segment[]): EditState {
  return { segments, past: [], future: [], dragBase: null };
}

function sameSegments(a: Segment[], b: Segment[]): boolean {
  return a.length === b.length && a.every((s, i) => s.start === b[i].start && s.end === b[i].end);
}

export function editReducer(state: EditState, action: EditAction): EditState {
  switch (action.type) {
    case 'reset':
      return initEditState(action.segments);
    case 'commit':
      if (sameSegments(action.segments, state.segments)) return state;
      return { segments: action.segments, past: [...state.past, state.segments], future: [], dragBase: null };
    case 'live':
      return { ...state, segments: action.segments };
    case 'beginDrag':
      return { ...state, dragBase: state.segments };
    case 'endDrag': {
      if (!state.dragBase || sameSegments(state.dragBase, state.segments)) {
        return { ...state, dragBase: null };
      }
      return { ...state, past: [...state.past, state.dragBase], future: [], dragBase: null };
    }
    case 'undo': {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      return {
        segments: prev,
        past: state.past.slice(0, -1),
        future: [state.segments, ...state.future],
        dragBase: null,
      };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        segments: next,
        past: [...state.past, state.segments],
        future: state.future.slice(1),
        dragBase: null,
      };
    }
    default:
      return state;
  }
}
