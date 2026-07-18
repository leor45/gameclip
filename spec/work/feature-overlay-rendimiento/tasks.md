# Tasks — Overlay de rendimiento configurable

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [ ] 1. `src/shared/capture.ts`: tipo `PerfOverlaySettings`, defaults y `normalizePerfOverlay()`
      integrado en `normalizeCaptureSettings()`.
- [ ] 2. Ajustes → Avanzado: fieldset "Overlay de rendimiento" (enabled, checks de métricas,
      posición, orientación, color, opacidad) sobre `SeccionForm`/`useCaptureSettings`.
- [ ] 3. Página `perf-overlay.html` + vista React tonta: pinta snapshot de métricas con la config
      visual recibida por IPC (`—` para valores null).
- [ ] 4. `src/main/perf-overlay.ts`: `PerfOverlayController` (ventana transparente click-through,
      `setContentProtection(true)`, posición según settings, crear/destruir según `enabled`).
- [ ] 5. `src/main/perf-metrics/`: sampler de CPU/RAM (os) con snapshot cada 1 s.
- [ ] 6. Helper LibreHardwareMonitor (GPU uso/temp/fans/voltaje/VRAM + temp CPU): wrapper de
      proceso, parseo de JSON, degradación a null si falla.
- [ ] 7. Helper PresentMon (FPS del PID del juego detectado): wrapper, parseo CSV, degradación.
- [ ] 8. `src/main/overlay.ts`: `moveTop()` al mostrar zonas (REC/toast/aviso encima del perf).
- [ ] 9. Wiring en main: instanciar controller, re-configurar en settings-changed, pasar PID del
      juego, apagar helpers al desactivar/cerrar.
- [ ] 10. Build: bundlear helpers en `resources/` y ajustar el empaquetado portable.

## Tests unitarios (obligatorios)

- [ ] `normalizePerfOverlay`: defaults con input basura, colores hex inválidos, opacidad fuera de
      rango, posición/layout desconocidos, migración de settings guardados sin `perfOverlay`.
- [ ] Sampler CPU/RAM: cálculo de delta de `os.cpus()` (mock), snapshot solo con métricas
      marcadas.
- [ ] Parseo de salida del helper LHM: JSON válido, sensor ausente → null, proceso caído → todos
      null sin excepción.
- [ ] Parseo de salida de PresentMon: CSV válido → FPS, salida vacía/corrupta → null.
- [ ] UI Avanzado: los checks reflejan settings y `set()` recibe el parcial correcto (patrón de
      `ajustes.test.tsx`).
- [ ] Vista overlay: pinta solo métricas presentes, aplica color/opacidad, `—` para null.

## Verificación (gates)

- [ ] Type-check verde (`npm run typecheck`)
- [ ] Lint verde (`npm run lint`)
- [ ] Tests verdes (`npm run test`)
- [ ] Comprobación manual: overlay visible en juego borderless; REC/toast por encima; clip de
      game capture y grabación de escritorio SIN el overlay en el vídeo; desactivar mata ventana
      y helpers (comprobar en Administrador de tareas).

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
