# Tasks — Salir de la app mientras graba deja el vídeo en negro

## Tests de regresión (primero, en rojo)

- [ ] `finalizarGrabacion` con estado `recording` llama a `stopRecording` y espera a que termine.
- [ ] `finalizarGrabacion` resuelve al vencer el tope aunque `stopRecording` no termine nunca, y no rechaza si falla.
- [ ] `finalizarGrabacion` sin grabación no llama a `stopRecording`.
- [ ] Manager: grabación manual empezada con el juego X, juego cerrado, stop → `finishSavedClip`/`clip-saved` con X.
- [ ] Manager: grabación manual empezada en escritorio, juego lanzado a mitad, stop → `clip-saved` con `null`.

## Implementación

- [ ] 1. `finalizarGrabacion` en `shutdown.ts`.
- [ ] 2. `before-quit` con `preventDefault` y reintento de `app.quit()` en `index.ts`.
- [ ] 3. `sessionGameName` en grabación manual (`manager.ts`).

## Verificación (gates)

- [ ] Type-check verde (`npm run typecheck`)
- [ ] Lint verde (`npm run lint`)
- [ ] Tests verdes (`npm run test`)
- [ ] Comprobación manual: modo auto con un juego, «Salir» desde la bandeja → el MP4 tiene imagen, está en la carpeta del juego y sale en la biblioteca.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
