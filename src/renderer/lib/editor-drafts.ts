// Ediciones sin terminar del editor avanzado ("drafts"), guardadas por clip en localStorage para
// poder retomarlas. Pref/estado local del renderer, como el alto del panel. Nota: "draft" es término
// interno; en la UI todo esto se llama "edición sin terminar" (lenguaje sencillo).

import { normalizeReframe, type Reframe } from '@shared/reframe';
import type { Segment } from '@shared/timeline';
import { trackGain, type TrackVolumes } from '@shared/tracks';

/** Estado de edición comparable/persistible: cortes, volúmenes por pista, pistas quitadas y reencuadre. */
export interface EditSnapshot {
  segments: Segment[];
  volumes: TrackVolumes;
  removed: string[];
  reframe: Reframe;
}

/** Una edición guardada: el estado + a qué clip pertenece y cuándo se tocó por última vez. */
export interface EditorDraft extends EditSnapshot {
  clipId: number;
  updatedAt: number;
}

const PREFIX = 'gameclip.editor.draft.';
const draftKey = (clipId: number): string => `${PREFIX}${clipId}`;

/** ¿Dos ediciones son equivalentes? (para saber si hay cambios respecto al estado recién abierto). */
export function sameEdit(a: EditSnapshot, b: EditSnapshot): boolean {
  return sameSegments(a.segments, b.segments) &&
    sameVolumes(a.volumes, b.volumes) &&
    sameRemoved(a.removed, b.removed) &&
    sameReframe(a.reframe, b.reframe);
}

function sameSegments(a: Segment[], b: Segment[]): boolean {
  return a.length === b.length && a.every((s, i) => s.start === b[i].start && s.end === b[i].end);
}

function sameVolumes(a: TrackVolumes, b: TrackVolumes): boolean {
  // Una clave ausente equivale a ganancia 1 (100 %): se compara la ganancia efectiva sobre la unión.
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (trackGain(a, k) !== trackGain(b, k)) return false;
  return true;
}

function sameRemoved(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function sameReframe(a: Reframe, b: Reframe): boolean {
  return a.aspect === b.aspect && a.mode === b.mode && a.zoom === b.zoom &&
    a.offset.x === b.offset.x && a.offset.y === b.offset.y;
}

/** Guarda (o sobrescribe) la edición de un clip. Best-effort: localStorage puede fallar. */
export function saveDraft(draft: EditorDraft): void {
  try {
    localStorage.setItem(draftKey(draft.clipId), JSON.stringify(draft));
  } catch {
    // Sin persistencia: la edición sigue en memoria hasta salir.
  }
}

/** Edición guardada de un clip, o `null` si no hay o está corrupta. */
export function loadDraft(clipId: number): EditorDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(clipId));
    return raw === null ? null : parseDraft(raw);
  } catch {
    return null;
  }
}

/** Borra la edición guardada de un clip. */
export function deleteDraft(clipId: number): void {
  try {
    localStorage.removeItem(draftKey(clipId));
  } catch {
    // best-effort
  }
}

/** Todas las ediciones sin terminar, de la más reciente a la más antigua; ignora las corruptas. */
export function listDrafts(): EditorDraft[] {
  const out: EditorDraft[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k === null || !k.startsWith(PREFIX)) continue;
      const raw = localStorage.getItem(k);
      const draft = raw === null ? null : parseDraft(raw);
      if (draft) out.push(draft);
    }
  } catch {
    return [];
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Valida y normaliza una edición serializada; `null` si le falta algo esencial. */
function parseDraft(raw: string): EditorDraft | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const d = value as Record<string, unknown>;
  if (typeof d.clipId !== 'number' || !Number.isInteger(d.clipId) || d.clipId <= 0) return null;
  if (!isSegments(d.segments)) return null;
  if (!Array.isArray(d.removed) || !d.removed.every((r) => typeof r === 'string')) return null;
  const volumes = isVolumes(d.volumes) ? (d.volumes as TrackVolumes) : {};
  const updatedAt = typeof d.updatedAt === 'number' && Number.isFinite(d.updatedAt) ? d.updatedAt : 0;
  return {
    clipId: d.clipId,
    segments: d.segments as Segment[],
    volumes,
    removed: d.removed as string[],
    reframe: normalizeReframe(d.reframe),
    updatedAt,
  };
}

function isSegments(value: unknown): value is Segment[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (s) =>
        typeof s === 'object' &&
        s !== null &&
        typeof (s as Segment).start === 'number' &&
        typeof (s as Segment).end === 'number',
    )
  );
}

function isVolumes(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
