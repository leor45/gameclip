# Tasks — El buffer de repetición se pausa durante la grabación manual

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. `doStartRecording`: parar el buffer (sin desproteger el overlay) antes de grabar.
- [x] 2. `doSaveReplay`: con el buffer parado por una grabación manual, emitir `replay-skipped` sin
      tocar libobs.
- [x] 3. `index.ts`: toast «Ya estás grabando» y selftest `_CLIP=1` acorde.

## Tests unitarios (obligatorios)

- [x] Grabar a mano para el buffer y al parar vuelve a `buffering` con el buffer corriendo.
- [x] `saveReplay` durante una grabación manual: sin `saveReplay` en libobs y evento `replay-skipped`.
- [x] Modo `auto`: la sesión graba con el buffer activo (sin cambios).
- [x] Sin desprotección del overlay al pasar de `buffering` a `recording`.
- [x] Caso borde: grabar desde `idle` (sin buffer) no llama a `stopReplayBuffer`.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`)
- [x] Comprobación manual: selftest con `GAMECLIP_SELFTEST_CLIP=1` y log de libobs (buffer parado
      durante la grabación, arrancado después; grabación con ~17 frames de pérdida).

## Cierre

- [x] Aprobación del owner
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
