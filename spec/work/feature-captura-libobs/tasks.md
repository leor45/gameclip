# Tasks — Captura nativa con libobs (Fase 3)

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [ ] 1. Instalar `@streamlabs/obs-studio-node@0.26.29b18` (URL S3 fijada) y verificar binarios.
- [ ] 2. `src/shared/capture.ts` (settings + status + defaults + validación) y canales IPC.
- [ ] 3. `settings-store.ts`: cargar/guardar/validar JSON en userData.
- [ ] 4. `obs.ts`: init falible, contexto de video, escena (game+monitor), audio, encoders
      disponibles, recording, replay buffer, señales.
- [ ] 5. `manager.ts`: estados, arranque del buffer, grabación manual, save replay, hotkey.
- [ ] 6. Wiring main (`index.ts`, `ipc.ts`, globalShortcut, will-quit) + preload.
- [ ] 7. UI: vista Ajustes real + CaptureBar en el shell.

## Tests unitarios (obligatorios)

- [ ] shared — validación/normalización de CaptureSettings (valores fuera de rango → defaults).
- [ ] main — settings-store: round-trip, archivo corrupto → defaults, merge de parciales.
- [ ] renderer — Ajustes: carga valores, guarda cambios (API mockeada), muestra encoders.
- [ ] renderer — CaptureBar: estados (unavailable/idle/buffering/recording) y acciones.

## Verificación (gates)

- [ ] Type-check verde (`npm run typecheck`)
- [ ] Lint verde (`npm run lint`)
- [ ] Tests verdes (`npm run test`)
- [ ] Comprobación manual: buffer activo al abrir la app; F8 guarda clip retroactivo .mp4
      reproducible en Videos/GameClip; grabación manual start/stop genera archivo; ajustes
      persisten tras reinicio; con osn roto la app sigue viva mostrando el error.

## Cierre

- [ ] Aprobación del owner (delegada esta sesión)
- [ ] Merge a `main` con `--no-ff` y rama borrada
- [ ] `spec/constitution/roadmap.md` actualizado
