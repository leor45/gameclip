# Plan — Captura nativa con libobs (Fase 3)

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Todo libobs vive en el proceso main dentro de `src/main/capture/`, detrás de una clase
`CaptureManager` con estado propio (`unavailable | idle | buffering | recording`) que expone
métodos y emite eventos; el renderer solo habla IPC tipado. La init de osn es **lazy y
falible**: si `IPC.host`/`initAPI` fallan, el estado queda `unavailable` con el error y la app
sigue viva.

Fuente de verdad de la API: los tests oficiales de osn (`SimpleRecordingFactory`,
`SimpleReplayBufferFactory`, `VideoFactory`, `VideoEncoderFactory`, `AudioEncoderFactory`,
señales vía `signalHandler`). Escena única: `game_capture` (any_fullscreen) sobre
`monitor_capture` del monitor primario, más `wasapi_output_capture` (canal 2) y
`wasapi_input_capture` (canal 3, opcional). El buffer de repetición corre siempre que la
captura esté disponible; la grabación manual comparte encoders con el buffer.

Instalación: `@streamlabs/obs-studio-node` desde el S3 de Streamlabs
(`osn-0.26.29b18-release-win64.tar.gz`, build del 2026-07-09 contra Electron 29). Los
binarios (libobs, plugins, ffmpeg) vienen dentro del paquete.

## Archivos / módulos afectados

- `package.json` — dependencia `@streamlabs/obs-studio-node` (URL S3 con versión fijada).
- `src/shared/capture.ts` — `CaptureSettings`, `CaptureStatus`, defaults y validación pura.
- `src/shared/ipc.ts` — canales nuevos: get/set settings, encoders, start/stop grabación,
  save replay, status + evento push `capture:status-changed`.
- `src/main/capture/obs.ts` — wrapper osn: init/shutdown, escena, encoders, recording,
  replay buffer, señales → promesas.
- `src/main/capture/manager.ts` — `CaptureManager`: orquesta osn + settings + hotkey,
  emite estado.
- `src/main/capture/settings-store.ts` — persistencia JSON en `userData` (pura, testeable).
- `src/main/index.ts` · `src/main/ipc.ts` — wiring: init tras `ready`, handlers IPC,
  `globalShortcut` (hotkey configurable), shutdown en `will-quit`, push de eventos a la
  ventana.
- `src/preload/index.ts` — API `capture` expuesta (invoke + suscripción a eventos).
- `src/renderer/views/Ajustes.tsx` — formulario real de ajustes.
- `src/renderer/components/CaptureBar.tsx` — estado + botones (grabar/detener, guardar clip).
- `electron.vite.config.ts` — sin cambios (externalizeDeps ya excluye el paquete nativo).

## Decisiones y alternativas consideradas

- **APIs "Simple" de osn (SimpleRecording/SimpleReplayBuffer)** — descartado el API legacy
  `NodeObs.OBS_service_*`: las factories nuevas son las que osn testea hoy y permiten
  contexto de video y encoders explícitos.
- **game_capture + monitor_capture apilados** — descartado elegir fuente por detección de
  juego (Fase 6): apilarlas da "siempre graba algo" sin lógica de detección.
- **Hotkey con `globalShortcut` de Electron** — descartado `node-libuiohook` de Streamlabs:
  una dependencia nativa menos; si algún juego exclusivo se traga el hotkey, se reevalúa.
- **Settings en JSON de userData** — descartado meterlos en SQLite del server: son ajustes
  por máquina, el main los necesita antes de que el server responda.
- **Buffer siempre activo** (estilo de las apps de clips) — descartado botón de armado manual: el valor del
  producto es no perder el momento; el costo es RAM/CPU aceptable y configurable (duración).

## Riesgos

- **Mayor riesgo del proyecto:** osn puede fallar según GPU/drivers/permisos. Mitigación:
  init falible con estado `unavailable` + error visible, y verificación manual en la máquina
  real del owner como parte de esta tarea.
- El tarball no fija checksum: la URL con versión (`0.26.29b18`) queda en package.json y
  package-lock registra el integrity hash del momento de la instalación.
- Anticheats pueden bloquear `game_capture`; el fallback `monitor_capture` queda debajo en
  la misma escena.
- `%CCYY-%MM-%DD %hh-%mm-%ss` como fileFormat: nombres únicos; colisiones improbables.

---

**Estado:** ✅ aprobado el 2026-07-10 (aprobación delegada por el owner al agente para esta sesión)
