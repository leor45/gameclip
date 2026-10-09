# Tasks — Ajustes que se pierden o se pisan

## Tests de regresión (primero, en rojo)

- [x] Manager: `setSettings` durante `recording` → no reconstruye; al `stopRecording` se llama `buildPipeline` con los ajustes nuevos.
- [x] Hook: tras un `settings:changed` externo (p. ej. `replaySeconds`), `save()` de otra sección no lo pisa (el parcial solo lleva lo editado).
- [x] Hook: un campo editado y no guardado no se sobrescribe con un `settings:changed`.
- [x] Hook: `save()` sin cambios no llama a `setSettings`.

## Implementación

- [x] 1. `pendingRebuild` en `CaptureManager.setSettings`.
- [x] 2. Claves editadas, guardado por diferencias y suscripción en `useCaptureSettings`.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`)
- [x] Comprobación manual: Ajustes → General abierto, cambiar «Clip» en la barra superior, guardar la sección → la duración nueva queda.

## Cierre

- [x] Aprobación del owner
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
