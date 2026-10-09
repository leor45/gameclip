# Tasks — Los caminos de error de la grabación dejan el buffer y el estado desincronizados

## Tests unitarios (obligatorios; primero, en rojo)

- [x] Regresión BUG-1: `startRecording` de libobs rechaza → estado `'buffering'`, buffer corriendo.
- [x] Regresión BUG-2: `stopRecording` de libobs rechaza → buffer rearrancado, siguiente grabación OK.
- [x] Regresión BUG-3: `buildPipeline` lanza → `'idle'` con error, sin buffer; el siguiente rebuild
      recupera.

## Implementación

- [x] 1. `recoverAfterRecordingError()` en los catch de start/stop.
- [x] 2. `rebuildPipeline`: reset de `bufferRunning` antes de construir; `pendingRebuild` si lanza.
- [x] 3. `reconcileBuffer` y `applyActiveGame` respetan `pendingRebuild`.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`)

## Cierre

- [x] Aprobación del owner
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
