# Plan — Salir de la app mientras graba deja el vídeo en negro

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

### Cierre ordenado (`src/main/shutdown.ts` + `src/main/index.ts`)

- Helper testeable en `shutdown.ts`:
  `finalizarGrabacion(capture: { getStatus(); stopRecording() }, timeoutMs): Promise<void>` — si el
  estado es `recording`, `await Promise.race([capture.stopRecording(), timeout])`; nunca rechaza.
- En `index.ts`, `before-quit`:
  ```ts
  if (!grabacionCerrada && capture?.getStatus().state === 'recording') {
    event.preventDefault();
    if (!cerrandoGrabacion) {
      cerrandoGrabacion = true;
      void finalizarGrabacion(capture, 10_000).finally(() => { grabacionCerrada = true; app.quit(); });
    }
    return;
  }
  ```
  `before-quit` corre antes que `will-quit`, así que cuando `teardown` destruye el pipeline la salida
  ya está parada. Los relanzados (HDR, admin) pasan por `app.quit()` y quedan cubiertos.

### Juego de la sesión (`src/main/capture/manager.ts`)

- `sessionGameName` pasa a `string | null | undefined` (`undefined` = no hay sesión): así se distingue
  «sesión de escritorio» (`null`) de «sin sesión».
- `doStartRecording` fija `sessionGameName = activeGame?.name ?? null`.
- `doStopRecording` y `stopSessionRecording` usan
  `game = sessionGameName !== undefined ? sessionGameName : status.detectedGame` tanto para
  `finishSavedClip` como para `emitClipSaved`; y lo vuelven a `undefined`.

## Archivos / módulos afectados

- `src/main/shutdown.ts`, `src/main/index.ts` — cierre ordenado.
- `src/main/capture/manager.ts` — juego de la sesión.
- `src/main/__tests__/shutdown.test.ts`, `src/main/__tests__/capture-manager.test.ts` — regresiones.

## Decisiones y alternativas consideradas

- **`before-quit` + `preventDefault`** frente a parar dentro de `will-quit`: `will-quit` es síncrono
  para nosotros (no se puede esperar una promesa); `before-quit` sí se puede cancelar y reintentar.
- **Tope de 10 s** — `stopRecording` espera la señal `wrote` (hasta 15 s en `waitForSignal`); 10 s
  cubre el caso normal sin dejar la app colgada si libobs no responde.

## Riesgos

- La verificación real depende de libobs: se comprueba en la rama de integración con una grabación de
  verdad (modo auto + «Salir»).

---

**Estado:** ⏳ pendiente de aprobación
