# Tasks — Ajustes que se pierden o se pisan

## Tests de regresión (primero, en rojo)

- [ ] Manager: `setSettings` durante `recording` → no reconstruye; al `stopRecording` se llama `buildPipeline` con los ajustes nuevos.
- [ ] Hook: tras un `settings:changed` externo (p. ej. `replaySeconds`), `save()` de otra sección no lo pisa (el parcial solo lleva lo editado).
- [ ] Hook: un campo editado y no guardado no se sobrescribe con un `settings:changed`.
- [ ] Hook: `save()` sin cambios no llama a `setSettings`.

## Implementación

- [ ] 1. `pendingRebuild` en `CaptureManager.setSettings`.
- [ ] 2. Claves editadas, guardado por diferencias y suscripción en `useCaptureSettings`.

## Verificación (gates)

- [ ] Type-check verde (`npm run typecheck`)
- [ ] Lint verde (`npm run lint`)
- [ ] Tests verdes (`npm run test`)
- [ ] Comprobación manual: Ajustes → General abierto, cambiar «Clip» en la barra superior, guardar la sección → la duración nueva queda.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
