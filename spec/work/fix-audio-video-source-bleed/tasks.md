# Tasks — El audio del juego se cuela en todas las pistas (bleed de la fuente de vídeo)

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Tests unitarios (obligatorios) — el de regresión primero (rojo → verde)

- [x] Regresión: `gameCaptureSettings` emite `capture_audio: false` (con ventana y en any_fullscreen)
- [x] Regresión: `monitorCaptureSettings` emite `capture_audio: false`

## Implementación

- [x] 1. `capture_audio: false` en `monitorCaptureSettings` ([obs.ts](../../../src/main/capture/obs.ts))
- [x] 2. `capture_audio: false` en `gameCaptureSettings` (base, antes de las opciones condicionales)

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 552 pass
- [ ] Comprobación manual: clip de juego con pistas separadas → cada pista solo su fuente; bajar el
      volumen del juego lo baja en el clip (requiere captura real; pendiente del owner)

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
