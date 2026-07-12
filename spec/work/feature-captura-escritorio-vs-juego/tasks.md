# Tasks — Captura de escritorio vs captura de juego

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. `src/shared/capture.ts`: claves nuevas (`desktopRecordingEnabled`, `desktopAudioTracks`),
      defaults, normalización, tipo `CaptureProfile` y helper puro `captureProfile()`.
- [x] 2. `src/main/capture/obs.ts`: helper puro `effectiveCapture()` (perfil → vídeo + audio efectivo)
      y `gameCaptureSettings()` (modo `window` cuando hay ejecutable).
- [x] 3. `obs.ts`: `buildPipeline()` monta UNA sola fuente de vídeo según el perfil (monitor / game /
      ninguna) en vez de apilar el game capture sobre el monitor.
- [x] 4. `obs.ts`: `buildAudioSources()` usa la config efectiva; en perfil `none` no abre ningún
      dispositivo de audio (solo registra la pista para que las salidas tengan un mixer válido).
- [x] 5. `src/main/capture/manager.ts`: `builtProfile` + `pendingRebuild`; rebuild al cambiar de perfil,
      aplazado si hay una grabación en curso (`settleAfterRecording()`).
- [x] 6. `manager.ts`: el religado en caliente (audio y game capture) queda restringido a la rotación
      DENTRO del perfil de juego; perfil `none` bloquea buffer, `startRecording()` y `saveReplay()`.
- [x] 7. UI: sección Escritorio con interruptor maestro, selector de pistas de audio y controles hijos
      deshabilitados; nota en la sección Audio aclarando que solo aplica a capturas de juego.
- [x] 8. Versión de la app a `0.2.0`.

## Tests unitarios (obligatorios)

- [x] `captureProfile`: matriz completa (escritorio on/off × auto-switch on/off × juego sí/no).
- [x] `effectiveCapture`: escritorio con audio por apps → audio del PC entero y pistas según
      `desktopAudioTracks`; juego → ajustes del usuario intactos; `none` → sin vídeo.
- [x] `gameCaptureSettings`: modo `window` con ejecutable, `any_fullscreen` sin él, HDR/overlays.
- [x] Manager: lanzar un juego reconstruye apuntando al juego; sin auto-switch no reconstruye.
- [x] Manager: sin grabación de escritorio y sin juego no se bufferiza y grabar/replay devuelven motivo.
- [x] Manager: un juego lanzado durante una grabación no la corta (rebuild aplazado al parar).
- [x] Manager: desactivar la grabación de escritorio en caliente detiene el buffer.
- [x] Manager (regresión): la rotación juego A → juego B sigue religando en caliente, sin rebuild.
- [x] UI: el interruptor maestro guarda y deshabilita sus hijos; `desktopAudioTracks` se guarda.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 433 pasando
- [ ] Comprobación manual: clip de escritorio con Spotify sonando y audio configurado por apps →
      el clip trae TODO el audio del PC; lanzar un juego en ventana sin bordes → el clip muestra
      solo el juego; desactivar la grabación de escritorio → sin juego no se graba nada.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
