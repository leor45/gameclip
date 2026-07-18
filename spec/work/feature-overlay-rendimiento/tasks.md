# Tasks — Overlay de rendimiento configurable

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. `src/shared/capture.ts`: tipo `PerfOverlaySettings` (con `posX`/`posY`, `toggleHotkey`),
      defaults, `normalizePerfOverlay()`, `presetFor()` y `clampPerfPosition()` (sin centro).
      *(Quedó en `src/shared/perf.ts` + campos `perfOverlayEnabled`/`perfOverlayHotkey`/`perfOverlay`
      en `CaptureSettings`; el atajo es plano para entrar al catálogo `HOTKEY_ACTIONS`.)*
- [x] 2. Ajustes → Avanzado: fieldset "Overlay de rendimiento" — switch, hotkey, checks de
      métricas, preset con flechas + sliders H/V sincronizados, disposición, color, opacidad,
      opt-in de admin.
- [x] 3. Preview en vivo: IPC de preview (debounced) que mueve/repinta la ventana al arrastrar,
      antes de guardar; al salir sin guardar se restaura la config persistida.
- [x] 4. Página `perf-overlay.html` + vista React tonta: pinta snapshot con la config visual
      (`—` para null).
- [x] 5. `src/main/perf-overlay.ts`: `PerfOverlayController` (ventana transparente click-through,
      `setContentProtection(true)`, posición desde posX/posY, crear/destruir según `enabled`,
      toggle de visibilidad, recarga si su renderer muere).
- [x] 6. Hotkey global Alt+R (configurable) que alterna la visibilidad, en el catálogo
      `HOTKEY_ACTIONS` (colisiones + reserva del PTT gratis, y aparece en la sección Atajos).
- [x] 7. `src/main/perf-metrics/`: sampler de CPU/RAM (os) con snapshot cada 1 s.
- [x] 8. Helpers bundleados: `gc-perf-sensors` (C# net48 + LibreHardwareMonitorLib, compilado con
      el csc de Windows) + `gc-presentmon.exe` (binario oficial 1.10.0, ~380 KB) vía
      `scripts/build-perf-sensors.ps1`; en `build:native` y `extraResources`.
- [x] 9. Wrapper LibreHardwareMonitor (GPU uso/temp/fans/voltaje/VRAM + temp CPU): proceso, parseo
      JSON, degradación a null (temperaturas ≤ 0 = sensor sin permisos → null).
- [x] 10. Wrapper PresentMon (FPS por `-process_name` del juego activo): parseo CSV
      (msBetweenPresents), media por ventana de 1 s, degradación sin permisos.
- [x] 11. `src/main/overlay.ts`: `moveTop()` al mostrar zonas (REC/toast/aviso encima del perf).
- [x] 12. Auto-inicio elevado opt-in: tarea programada al logon (`RunLevel=Highest`, ruta real
      del portable), aplicado SOLO al cambiar el ajuste, reversión si el UAC se cancela.
- [x] 13. Wiring en main: instanciar controller, re-config en settings-changed, ejecutable del
      juego activo → PresentMon, apagar helpers al desactivar/cerrar.
- [x] 14. Medir tamaño del exe portable antes/después (criterio: crece ≤ ~5 MB). Medido
      2026-07-18: 98 415 667 → 98 890 734 bytes = **+0,45 MB** (los ~4,5 MB de helpers quedan en
      ~0,5 MB tras la compresión LZMA del portable). Los 4 helpers presentes en `resources/`.

## Tests unitarios (obligatorios)

- [x] `normalizePerfOverlay`: defaults con input basura, hex inválido, opacidad/posX/posY fuera
      de rango, migración de settings sin `perfOverlay`.
- [x] `presetFor`/`clampPerfPosition`: las 8 zonas, bordes de banda, y centro-centro reubicado.
- [x] Sampler CPU/RAM: delta de `os.cpus()` (mock), snapshot solo con métricas marcadas.
- [x] Parseo LHM: JSON válido, sensor ausente → null, proceso caído → todos null sin excepción;
      sin binario no insiste; muerto no se relanza solo.
- [x] Parseo PresentMon: cabecera CSV, valores, FpsTracker (media y datos viejos → null),
      target fallido no se reintenta.
- [x] Rutas/args de helpers y `schtasks`/PowerShell elevado (alta, baja, escapado, UAC cancelado).
- [x] UI Avanzado: checks reflejan settings, slider ↔ preset (incluido esquive del centro),
      preview en vivo, rechazo de tecla del PTT y de atajos ya asignados, opt-in admin.
- [x] Vista overlay: solo métricas presentes, color/opacidad/disposición/anclaje, `—` para null.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 811 tests, 74 archivos
- [x] Comprobación E2E en máquina real (dev + CDP, 2026-07-18): ventana del overlay viva con
      métricas reales (GPU 38 %, 42 °C, VRAM 4,1/12 GB, CPU/RAM; voltaje, temp CPU y FPS en «—»
      por hardware/permisos, como se diseñó) **y captura GDI de esa esquina SIN el overlay**
      (la exclusión de capturas funciona) mientras un emulador corría en pantalla.
- [ ] Comprobación manual pendiente (owner): REC/toast por encima en juego, Alt+R, clip real de
      game capture y grabación de escritorio sin el overlay, auto-inicio elevado tras relogon.

## Refinamiento post-prueba (2026-07-18)

- [x] R1. Tamaño de fuente: preset `small | standard | large` en la config, `<select>` en Ajustes y
      clases CSS (11 / 14 / 19 px).
- [x] R2+R3. FPS independientes de la detección y persistentes en segundo plano: PresentMon en
      `-captureall` (+`-no_top`, +`-exclude` de `dwm.exe` y la propia app), un `FpsTracker` por
      proceso y selección **enganchada al juego** (se mantiene mientras presente; si deja de hacerlo,
      salta al de mayor tasa). Se quita `setGameExe`/`detectedGame` de la ruta de FPS.
- [x] R4. Visible sobre juegos sin bordes: nivel `screen-saver` + re-elevado cada 2 s, re-elevando
      los avisos detrás para que sigan por encima.
- [x] Multiplicadores de frames (DLSS/FSR FG): se cumplen midiendo frames **presentados**; sin
      cambio de código, documentado en el spec.
- [x] Tests: tamaño de fuente (shared/página/UI), args de captura-todo, selección con enganche,
      re-enganche, denylist, sin-nada-presentando → `—`. **817 tests verdes.**
- [x] Verificación E2E (dev + CDP): fuente grande = 19 px, disposición lineal, esquina superior
      derecha, color/opacidad correctos; **la captura GDI de esa esquina sigue sin contener el
      overlay** tras subir a `screen-saver`; PresentMon sin admin degrada a `—` sin romper nada.
- [ ] Pendiente del owner (requiere sesión elevada y un juego): FPS de una app **no detectada**,
      FPS que **se mantienen en segundo plano**, FPS con multiplicador activo, y overlay visible en
      RE Requiem sin alt+tab.

### Segunda ronda (2026-07-18, probando RE Requiem con DLSS FG)

- [x] R5. Migración a **PresentMon 2.5.1**: la 1.10 no cuenta los frames generados por DLSS Frame
      Generation (daba ~19–61 fps donde Steam marcaba `DLSS 128 | FPS 64`); la 2.5.1 mide **133 fps**,
      coincidiendo con el total con generación. Flags a doble guion, `--no_console_stats` y sin
      `--process_name` (captura todo). El parseo no cambió: las columnas siguen siendo `Application`
      y `MsBetweenPresents`.
- [x] R6. Watchdog de "vivo pero mudo": reinicia PresentMon si no entrega ninguna línea en 12 s
      (máx. 3 intentos). Cubre el caso de cupos ETW agotados por sesiones huérfanas.
- [x] Tests de ambos: cabecera real de la 2.x, flags de doble guion, watchdog (reintenta, se rinde
      al tope, y no actúa si llegan líneas). **820 tests verdes.**
- [ ] Pendiente del owner: confirmar en pantalla que el contador coincide con el `DLSS` de Steam.

### Hallazgo de sesiones ETW (documentado)

Las sesiones ETW **sobreviven al proceso** que las creó: matar PresentMon deja la sesión viva. Con
varias huérfanas (propias o de Steam/NVIDIA App, que capturan igual) Windows agota los cupos del
proveedor y PresentMon arranca sin error pero **no recibe ni un evento** — síntoma: FPS en «—» sin
ninguna pista. Se limpian con `logman stop <nombre> -ets`. El watchdog de R6 lo mitiga.

### Hallazgo de permisos (documentado)

Sin privilegios de administrador PresentMon **no arranca la sesión ETW** (`access denied`, exit 6):
los FPS quedan en `—`. Con admin funcionan. Confirmado midiendo el binario a mano.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
