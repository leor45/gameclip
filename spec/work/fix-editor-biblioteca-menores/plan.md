# Plan — Fallos menores de la biblioteca y del editor avanzado

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

1. **`ClipCard.tsx`** — dependencias por valor: `const tagsKey = clip.tags.join(', ')`; el efecto
   depende de `[clip.title, tagsKey, editando]` y no hace nada si `editando` es `true`.
2. **`useThumbnailer.ts`** — un `useRef<Set<number>>` con los ids fallidos; el `find` los salta y se
   añaden cuando `extraer` devuelve `null`. Al añadir uno se fuerza otra pasada (estado `intento`) para
   que el siguiente pendiente no espere a una recarga ajena.
3. **`EditorAvanzado.tsx`** — `draftRestauradoRef`. En `syncVideoInfo`, cuando `duration === 0` y llega la
   real `d`:
   - base y `lastPersistedRef` → `initialSegments(d)` (solo los segmentos; volúmenes/reencuadre igual);
   - `dispatch(reset)` solo si **no** se restauró un borrador.

## Archivos / módulos afectados

- `src/renderer/components/ClipCard.tsx`
- `src/renderer/lib/useThumbnailer.ts`
- `src/renderer/views/EditorAvanzado.tsx`
- Tests: `src/renderer/__tests__/biblioteca.test.tsx`, `src/renderer/__tests__/editor-avanzado.test.tsx`

## Decisiones y alternativas consideradas

- **Saltar los fallidos en la sesión** frente a marcarlos en la DB: un fallo puede ser transitorio
  (archivo aún escribiéndose); en el siguiente arranque se reintenta solo.

## Riesgos

- El editor avanzado es grande; el cambio se limita a `syncVideoInfo` y a la carga del clip.

---

**Estado:** ⏳ pendiente de aprobación
