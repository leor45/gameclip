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
- [x] 9. (Salido de la verificación E2E) `startRecording` / `stopRecording` / `saveReplay` pasan por la
      MISMA cola que los rebuilds: un juego lanzado justo al pulsar grabar reconstruía el pipeline con
      la salida a medio arrancar y libobs nunca emitía la señal `start` (grabación muerta).

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
- [x] Manager (regresión de la carrera): pulsar grabar a la vez que se detecta un juego deja la
      grabación viva y aplaza el rebuild.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 434 pasando
- [x] E2E en máquina real (ajustes reales del owner: audio por apps Discord+opera, pistas separadas):
      - Escritorio con un tono sonando desde un proceso suelto (ni Discord ni opera): el clip trae
        **1 pista** con el audio del PC dentro (`mean_volume` −28,7 dB; el silencio daría `-inf`).
      - Con juego detectado (falso, vía `tasklist`): el clip se graba en perfil de juego con las
        **pistas por rol** (`default` · `game` · `mic` · `Discord` · `opera`).
      - Grabación en curso + juego lanzado: el clip se guarda entero, el rebuild espera al final.
- [ ] Pendiente del owner (no verificable con un juego falso): que un juego real en ventana sin
      bordes se vea **solo el juego** en el clip.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
