# Tasks — Salir de la app mientras graba deja el vídeo en negro

## Tests de regresión (primero, en rojo)

- [x] `finalizarGrabacion` con estado `recording` llama a `stopRecording` y espera a que termine.
- [x] `finalizarGrabacion` resuelve al vencer el tope aunque `stopRecording` no termine nunca, y no rechaza si falla.
- [x] `finalizarGrabacion` sin grabación no llama a `stopRecording`.
- [x] Manager: grabación manual empezada con el juego X, juego cerrado, stop → `finishSavedClip`/`clip-saved` con X.
- [x] Manager: grabación manual empezada en escritorio, juego lanzado a mitad, stop → `clip-saved` con `null`.

## Implementación

- [x] 1. `finalizarGrabacion` en `shutdown.ts`.
- [x] 2. `before-quit` con `preventDefault` y reintento de `app.quit()` en `index.ts`.
- [x] 3. `sessionGameName` en grabación manual (`manager.ts`).

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`)
- [x] Comprobación manual: modo auto con un juego, «Salir» desde la bandeja → el MP4 tiene imagen, está en la carpeta del juego y sale en la biblioteca.

## Cierre

- [x] Aprobación del owner
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
