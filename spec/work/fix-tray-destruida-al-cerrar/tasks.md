# Tasks — "Tray is destroyed" al cerrar la app

## Test de regresión (primero, en rojo)

- [x] `src/main/__tests__/shutdown.test.ts` — con una captura falsa que emite el `status` final al
      apagarse y una bandeja falsa con la semántica de Electron (tocar un `Tray` destruido lanza).
      Rojo con el orden viejo.
- [x] `src/main/__tests__/tray.test.ts` — primer `vi.mock('electron')` del repo: `setRecording()`
      tras `destroy()` no debe lanzar. Rojo: fallaba con `Error: Tray is destroyed`, el mismo
      mensaje del diálogo que veía el owner.

## Implementación

- [x] `src/main/shutdown.ts`: `teardown(partes)` — primero los emisores (hotkeys, PTT, timers,
      detector, captura) y después los oyentes (overlay, bandeja) y la API. Cada paso en su propio
      `try/catch`: un fallo aislado no puede dejar libobs y el puerto colgados.
- [x] `src/main/tray.ts`: `setRecording()` y `destroy()` no tocan un `Tray` ya destruido.
- [x] `src/main/index.ts`: `will-quit` delega en `teardown()` y anula las referencias.

## Verificación (gates)

- [x] Type-check verde
- [x] Lint verde
- [x] Tests verdes (402, +8 nuevos)
- [x] Comprobación manual sobre el **`.exe` empaquetado**: al cerrar no aparece ningún diálogo de
      error, la app sale sola, el **puerto 3030 queda libre** (prueba de que el `will-quit` corrió
      entero: antes la excepción lo abortaba antes de `api.close()`) y `obs64.exe` se apaga.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada
- [x] `spec/constitution/roadmap.md` actualizado
