# Tasks — Overlay de rendimiento configurable

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [ ] 1. `src/shared/capture.ts`: tipo `PerfOverlaySettings` (con `posX`/`posY`, `toggleHotkey`),
      defaults, `normalizePerfOverlay()`, `presetFor()` y `clampPerfPosition()` (sin centro).
- [ ] 2. Ajustes → Avanzado: fieldset "Overlay de rendimiento" — switch, hotkey, checks de
      métricas, preset con flechas + sliders H/V sincronizados, disposición, color, opacidad,
      opt-in de admin.
- [ ] 3. Preview en vivo: IPC de preview (throttled) que mueve/repinta la ventana al arrastrar,
      antes de guardar.
- [ ] 4. Página `perf-overlay.html` + vista React tonta: pinta snapshot con la config visual
      (`—` para null).
- [ ] 5. `src/main/perf-overlay.ts`: `PerfOverlayController` (ventana transparente click-through,
      `setContentProtection(true)`, posición desde posX/posY, crear/destruir según `enabled`,
      toggle de visibilidad).
- [ ] 6. Hotkey global Alt+R (configurable) que alterna la visibilidad, conviviendo con los
      hotkeys existentes.
- [ ] 7. `src/main/perf-metrics/`: sampler de CPU/RAM (os) con snapshot cada 1 s.
- [ ] 8. Descarga bajo demanda de helpers: asset zip del release, hash SHA-256, cache en carpeta
      de datos, estado en Ajustes, detección de .NET runtime (framework-dependent vs
      self-contained).
- [ ] 9. Helper LibreHardwareMonitor (GPU uso/temp/fans/voltaje/VRAM + temp CPU): wrapper de
      proceso, parseo JSON, degradación a null; hint de permisos sin admin.
- [ ] 10. Helper PresentMon (FPS del PID del juego activo): wrapper, parseo CSV, degradación;
      hint de permisos.
- [ ] 11. `src/main/overlay.ts`: `moveTop()` al mostrar zonas (REC/toast/aviso encima del perf).
- [ ] 12. Auto-inicio elevado opt-in: tarea programada al logon (`RunLevel=Highest`, ruta real
      del portable), alta/baja idempotente, restaurar clave Run al desmarcar.
- [ ] 13. Wiring en main: instanciar controller, re-config en settings-changed, PID del juego,
      apagar helpers al desactivar/cerrar.
- [ ] 14. Release: publicar `gameclip-perf-helpers-X.Y.Z.zip` y documentarlo en el proceso.

## Tests unitarios (obligatorios)

- [ ] `normalizePerfOverlay`: defaults con input basura, hex inválido, opacidad/posX/posY fuera
      de rango, hotkey vacío, migración de settings sin `perfOverlay`.
- [ ] `presetFor`/`clampPerfPosition`: las 8 zonas, bordes de banda, y centro-centro reubicado a
      izquierda/derecha más cercana.
- [ ] Sampler CPU/RAM: delta de `os.cpus()` (mock), snapshot solo con métricas marcadas.
- [ ] Parseo LHM: JSON válido, sensor ausente → null, proceso caído → todos null sin excepción.
- [ ] Parseo PresentMon: CSV válido → FPS, salida vacía/corrupta → null.
- [ ] Descarga de helpers: hash correcto/incorrecto, cache existente no re-descarga, sin red →
      estado de error limpio.
- [ ] Auto-inicio elevado: argumentos de `schtasks` generados (lógica pura, patrón
      `auto-launch.ts`), alta/baja idempotente.
- [ ] UI Avanzado: checks/sliders reflejan settings, mover slider actualiza preset, elegir preset
      fija sliders (patrón de `ajustes.test.tsx`).
- [ ] Vista overlay: pinta solo métricas presentes, aplica color/opacidad/disposición, `—` para
      null.

## Verificación (gates)

- [ ] Type-check verde (`npm run typecheck`)
- [ ] Lint verde (`npm run lint`)
- [ ] Tests verdes (`npm run test`)
- [ ] Comprobación manual: overlay visible en juego borderless (y un emulador); drag del slider
      mueve el overlay en vivo; Alt+R lo oculta/muestra; REC/toast por encima; clip de game
      capture y grabación de escritorio SIN el overlay; desactivar mata ventana y helpers;
      auto-inicio elevado arranca la app como admin tras relogon.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
