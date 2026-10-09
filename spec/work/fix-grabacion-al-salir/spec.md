# Spec — Salir de la app mientras graba deja el vídeo en negro

**Tipo:** Fix
**Rama:** `fix/grabacion-al-salir`
**Fecha:** 2026-10-08

## Problema / Objetivo

### 1. Salir durante una grabación la rompe (BUG-11, confirmado por el owner)

Si se cierra GameClip («Salir» en la bandeja, relanzar por HDR/admin, `app.quit()`) con una
grabación en curso —lo normal en **modo auto**, que graba la sesión entera del juego—, el clip queda
**con el vídeo en negro y el audio grabado**, y además no se reubica en la carpeta del juego ni se
cataloga.

**Causa raíz:** `will-quit` (`src/main/index.ts`) llama a `teardown`, que hace
`CaptureManager.shutdown()` → `ObsCapture.shutdown()` → `teardownPipeline()`, que **destruye** la
salida de grabación activa (`AdvancedRecordingFactory.destroy`) sin `stop()` previo ni esperar la
señal `wrote`. Nunca se pasa por `stopRecording` / `finishSavedClip`.

### 2. La grabación manual se etiqueta con el juego del final, no del principio (BUG-5)

`doStartRecording` no fija `sessionGameName` (solo lo hace el modo auto) y `doStopRecording` usa el
`detectedGame` vigente **al parar**. Si el juego se cierra antes de parar, el clip acaba en `Desktop/`;
si se rota a otro juego, se etiqueta con el otro. Se arregla aquí porque el cierre ordenado del punto 1
reutiliza `stopRecording` y tiene que etiquetar bien.

**Objetivo:** que salir de la app con una grabación en curso la cierre correctamente (vídeo válido,
en la carpeta de su juego y en la biblioteca), y que cada grabación pertenezca al juego con el que
empezó.

## Alcance

**Dentro:**
- Antes de salir, si hay una grabación en curso, se para con `stopRecording` y se espera a que
  termine (con un tope de tiempo para no colgar el cierre); después se sale.
- La grabación manual recuerda el juego con el que empezó y con él se nombra, se reubica y se cataloga.

**Fuera (explícito):**
- Apagado/cierre de sesión de Windows (`session-end`): Windows no deja demorarlo de forma fiable; queda
  documentado como limitación.
- Guardar el contenido del búfer de repetición al salir.

## Criterios de aceptación

- [ ] Modo auto con un juego abierto → «Salir» → el MP4 de la sesión se reproduce con imagen y audio, está en la carpeta del juego y aparece en la biblioteca al volver a abrir.
- [ ] Si parar la grabación tarda más del tope, la app sale igual.
- [ ] Salir sin grabación en curso no cambia nada (cierre inmediato).
- [ ] Grabación manual empezada con el juego X y parada con el juego ya cerrado → clip en la carpeta de X, catalogado como X.
- [ ] Grabación manual empezada en escritorio y con un juego lanzado a mitad → clip en `Desktop/`.
