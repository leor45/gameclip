# Tasks — Pulido de paridad (Fase 6)

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. Dominio: `bufferMode`/`overlayEnabled`/`autoLaunch` en `CaptureSettings` +
      normalización; `detectedGame` en `CaptureStatus`; `src/shared/games.ts` con la lista
      curada y `findRunningGame`.
- [x] 2. `GameDetector` en main (sondeo `tasklist`, listador inyectable, debounce de 2
      sondeos para el cierre).
- [x] 3. `CaptureManager`: backend inyectable (`CaptureBackend`), `setGameDetected`,
      buffer según `bufferMode`, `clip-saved` con juego; `LibraryManager` con `gameHint`.
- [x] 4. Contrato IPC: evento `OverlayState` + API `overlay.onState` en preload.
- [x] 5. Overlay: página `overlay.html` (entradas múltiples en electron.vite),
      componente `Overlay`, `OverlayController` en main (ventana transparente click-through,
      toast 3 s, visibilidad solo con contenido, ajuste `overlayEnabled`).
- [x] 6. Bandeja: `src/main/tray.ts` (icono embebido + variante grabando, menú
      Abrir/Guardar clip/Salir); close-to-tray y `--hidden` en `index.ts`.
- [x] 7. Auto-arranque: `applyAutoLaunch` con guard `app.isPackaged`, aplicado al inicio y
      al cambiar ajustes.
- [x] 8. UI: chip de juego detectado en `CaptureBar`; fieldset «Comportamiento» en Ajustes.

## Tests unitarios (obligatorios)

- [x] `games.test.ts` — matching case-insensitive, con/sin `.exe`, sin coincidencias.
- [x] `capture.test.ts` — normalización de los tres ajustes nuevos (válidos, inválidos,
      defaults).
- [x] `game-detector.test.ts` — emite `game-started` al aparecer, `game-stopped` tras 2
      sondeos sin el proceso, sin eventos duplicados, `stop()` corta el sondeo.
- [x] `capture-manager.test.ts` — modo `game`: init queda `idle`, juego arranca buffer,
      cierre lo detiene, `recording` nunca se interrumpe; modo `always`: init buffa;
      `clip-saved` lleva el juego detectado.
- [x] `library-manager.test.ts` — `gameHint` tiene prioridad sobre la ventana en primer
      plano.
- [x] `overlay.test.tsx` — REC visible al grabar, toast visible al guardar, nada en reposo.
- [x] `capture-ui.test.tsx` — chip del juego detectado; Ajustes muestra y guarda los
      ajustes nuevos.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`)
- [x] Comprobación manual: app dev arranca, detector sondea sin errores, overlay aparece
      al grabar (selftest), bandeja operativa, cerrar ventana no mata la app.

## Cierre

- [x] Aprobación del owner (delegada para esta sesión)
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
