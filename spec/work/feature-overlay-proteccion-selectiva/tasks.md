# Tasks — El overlay de rendimiento sale en capturas externas

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

> **Release:** mismo release que `feature/overlay-rendimiento` y `feature/fps-solo-en-juego`.

## Implementación

- [ ] 1. `src/shared/capture.ts`: función pura `needsContentProtection(profile, capturing)`.
- [ ] 2. `CaptureManager`: método privado que recalcula el estado y lo emite solo al cambiar.
- [ ] 3. Llamarlo desde `rebuildPipeline()` (tras fijar `builtProfile`), `startBuffer`/`stopBuffer`,
      `doStartRecording`/`doStopRecording`, `settleAfterRecording()` y `shutdown()`.
- [ ] 4. Orden seguro: proteger **antes** de arrancar la salida, desproteger **después** de pararla.
- [ ] 5. `src/main/index.ts`: puentear el evento al `PerfOverlayController`.
- [ ] 6. `PerfOverlayController.setCaptureProtection(boolean)` con guarda de "solo si cambió"; la
      ventana se sigue creando **protegida**.
- [ ] 7. Reaplicar `setAlwaysOnTop('screen-saver')` tras cada cambio **si** la E2E demuestra que
      conmutar la protección altera el z-order (no antes: sería código sin causa).

## Tests unitarios (obligatorios)

Camino feliz **y** casos borde.

- [ ] `needsContentProtection`: matriz completa perfil (`game`/`desktop`/`none`) × capturando (sí/no).
- [ ] El manager emite el estado al cambiar de perfil, al arrancar/parar el búfer y al
      arrancar/parar una grabación.
- [ ] **No** emite si el valor no cambió (evita repetir la llamada Win32).
- [ ] `shutdown()` deja el estado en "sin proteger".
- [ ] El controlador llama a `setContentProtection` solo en los cambios, y la ventana nace protegida.

## Verificación (gates)

- [ ] Type-check verde (`npm run typecheck`)
- [ ] Lint verde (`npm run lint`)
- [ ] Tests verdes (`npm run test`)
- [ ] Comprobación manual (owner): con juego detectado, recorte de Windows **con** overlay y clip real
      **sin** overlay; grabación de escritorio **sin** overlay; con `bufferMode: 'game'` y sin juego,
      recorte **con** overlay; REC / clip guardado / aviso de juego siguen por encima; sin parpadeo ni
      pérdida de z-order al conmutar.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
- [ ] **Release** con las notas de las tres ramas (`feature/overlay-rendimiento` +
      `feature/fps-solo-en-juego` + esta)
