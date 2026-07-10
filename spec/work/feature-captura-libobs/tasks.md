# Tasks — Captura nativa con libobs (Fase 3)

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. Instalar `@streamlabs/obs-studio-node@0.26.29b18` (URL S3 fijada) y verificar binarios.
      → La versión real se descubrió en `scripts/repositories.json` de Streamlabs Desktop
      (el tarball `osn-0.0.0` de npm/lockfile es un stub vacío). Build del 2026-07-09.
- [x] 2. `src/shared/capture.ts` (settings + status + defaults + validación) y canales IPC.
      → Nota: la calidad quedó como presets (`high/higher/lossless`) en lugar de bitrate
      crudo — `ERecordingQuality.Stream` exige un streaming configurado que no tenemos.
- [x] 3. `settings-store.ts`: cargar/guardar/validar JSON en userData.
- [x] 4. `obs.ts`: init falible, contexto de video, escena (game+monitor), audio, encoders
      disponibles, recording, replay buffer, señales. Const enums espejados como literales
      (esbuild no inlinea const enums de .d.ts).
- [x] 5. `manager.ts`: estados, arranque del buffer, grabación manual, save replay, hotkey.
- [x] 6. Wiring main (`index.ts`, `ipc.ts`, globalShortcut, will-quit) + preload.
      → Incluye smoke test sin UI: `GAMECLIP_SELFTEST=recording npm run dev`.
- [x] 7. UI: vista Ajustes real + CaptureBar en el shell.

## Tests unitarios (obligatorios)

- [x] shared — validación/normalización de CaptureSettings (basura → defaults, clamp de
      replaySeconds, campo a campo).
- [x] main — settings-store: round-trip entre instancias, archivo corrupto → defaults,
      normalización al guardar.
- [x] renderer — Ajustes: carga valores y encoders, guarda cambios (API mockeada).
- [x] renderer — CaptureBar: estados buffering/unavailable/recording, acciones save/start/stop,
      suscripción a eventos push.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 45 tests, 9 archivos
- [x] Comprobación manual **en la máquina real del owner (RTX)**:
      - libobs inicializa y el buffer arranca solo: `[capture] {"state":"buffering"}` ✓
      - **F8 guardó clip retroactivo**: `Replay 2026-07-10 18-36-01.mp4` — verificado con
        ffprobe: H.264 2560×1440 @60fps + AAC, 45.4 s retroactivos ✓
      - Grabación manual (selftest sin UI): archivo `2026-07-10 18-36-58.mp4` de 4.03 s ✓
      - La salida quedó en `Vídeos/GameClip` (redirigida por OneDrive) ✓

## Cierre

- [x] Aprobación del owner (delegada esta sesión)
- [x] Merge a `main` con `--no-ff` y rama borrada
- [x] `spec/constitution/roadmap.md` actualizado
