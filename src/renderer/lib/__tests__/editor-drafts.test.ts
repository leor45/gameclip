import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_REFRAME } from '@shared/reframe';
import {
  deleteDraft,
  listDrafts,
  loadDraft,
  sameEdit,
  saveDraft,
  type EditorDraft,
  type EditSnapshot,
} from '../editor-drafts';

afterEach(() => localStorage.clear());

const snap = (over: Partial<EditSnapshot> = {}): EditSnapshot => ({
  segments: [{ start: 0, end: 60 }],
  volumes: {},
  removed: [],
  reframe: DEFAULT_REFRAME,
  ...over,
});

const draft = (over: Partial<EditorDraft> = {}): EditorDraft => ({
  clipId: 7,
  updatedAt: 1000,
  ...snap(),
  ...over,
});

describe('sameEdit', () => {
  it('dos estados vírgenes iguales', () => {
    expect(sameEdit(snap(), snap())).toBe(true);
  });

  it('detecta cambios en cortes, volumen, pistas quitadas y reencuadre', () => {
    expect(sameEdit(snap(), snap({ segments: [{ start: 0, end: 30 }, { start: 40, end: 60 }] }))).toBe(false); // prettier-ignore
    expect(sameEdit(snap(), snap({ volumes: { game: 0.5 } }))).toBe(false);
    expect(sameEdit(snap(), snap({ removed: ['mic'] }))).toBe(false);
    expect(sameEdit(snap(), snap({ reframe: { ...DEFAULT_REFRAME, aspect: '9:16' } }))).toBe(false);
  });

  it('una ganancia 1 explícita equivale a ausente (100 %)', () => {
    expect(sameEdit(snap({ volumes: { game: 1 } }), snap({ volumes: {} }))).toBe(true);
  });

  it('el orden de las pistas quitadas no importa', () => {
    expect(sameEdit(snap({ removed: ['mic', 'game'] }), snap({ removed: ['game', 'mic'] }))).toBe(true);
  });
});

describe('save / load / delete', () => {
  it('guarda y recupera una edición', () => {
    const d = draft({ volumes: { game: 1.5 }, removed: ['mic'] });
    saveDraft(d);
    expect(loadDraft(7)).toEqual(d);
  });

  it('sin nada guardado devuelve null', () => {
    expect(loadDraft(7)).toBeNull();
  });

  it('una entrada corrupta devuelve null', () => {
    localStorage.setItem('gameclip.editor.draft.7', '{ no es json');
    expect(loadDraft(7)).toBeNull();
  });

  it('descarta una edición sin segmentos válidos', () => {
    localStorage.setItem('gameclip.editor.draft.7', JSON.stringify({ clipId: 7, segments: [] }));
    expect(loadDraft(7)).toBeNull();
  });

  it('delete la borra', () => {
    saveDraft(draft());
    deleteDraft(7);
    expect(loadDraft(7)).toBeNull();
  });
});

describe('listDrafts', () => {
  it('lista de la más reciente a la más antigua, ignorando corruptas', () => {
    saveDraft(draft({ clipId: 1, updatedAt: 100 }));
    saveDraft(draft({ clipId: 2, updatedAt: 300 }));
    saveDraft(draft({ clipId: 3, updatedAt: 200 }));
    localStorage.setItem('gameclip.editor.draft.99', 'corrupto');

    const ids = listDrafts().map((d) => d.clipId);
    expect(ids).toEqual([2, 3, 1]);
  });

  it('sin drafts, lista vacía', () => {
    expect(listDrafts()).toEqual([]);
  });
});
