# Plan — Juegos mal etiquetados en la biblioteca

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

1. **`gameFromPath`** devuelve `undefined` («no sé») cuando el archivo no cuelga de `outputDir`:
   `rel === '' || rel.startsWith('..') || isAbsolute(rel)`. `relabelGames` salta esos clips
   (`if (game === undefined) continue`). `reconcile` no cambia: solo da de alta archivos de dentro.
2. **`registerSavedClip`**: `game = gameHint ?? null`. Se quita la opción `getForegroundTitle` de
   `LibraryOptions` y su cableado en `index.ts` (`getForegroundWindowTitle` sigue usándose para el
   auto-cambio de juego).

## Archivos / módulos afectados

- `src/main/library/manager.ts` — ambos cambios.
- `src/main/index.ts` — deja de pasar `getForegroundTitle`.
- `src/main/__tests__/library-manager.test.ts` — regresiones (y adaptar los tests del fallback).

## Decisiones y alternativas consideradas

- **Dejar intactos los clips de fuera** frente a re-etiquetarlos con su carpeta padre: la carpeta de
  salida antigua puede no seguir el layout por juego (clips sueltos en la raíz), así que adivinar
  sería volver a inventar juegos.
- **Quitar el fallback** y no «solo para escritorio»: con la detección y el layout por carpetas, el
  título de una ventana nunca es mejor dato que la carpeta en la que se guarda el archivo.

## Riesgos

- Clips guardados sin detección en modo juego (no debería ocurrir) quedarían sin juego: es lo que
  diría su carpeta igualmente.

---

**Estado:** ⏳ pendiente de aprobación
