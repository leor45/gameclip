# Tasks — Captura de pantalla: monitor propio y compatibilidad HDR

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. **Test de regresión primero** (rojo): monitor objetivo ausente de las fuentes → no se elige
       ninguna fuente. Reproduce el bug reportado antes de tocar el código.
- [x] 2. `src/main/capture/screenshot-target.ts`: `pickScreenshotSource` + `ScreenshotFailure`
       (ruta DXGI estricta por `display_id`, ruta GDI por posición validada por aspecto).
       Se agregó `resolveTargetDisplay` aparte: su tamaño nativo es el `thumbnailSize` que hay que
       pedir, y usar el de otro monitor degradaba la resolución del vertical (1080x1920 → 810x1440).
- [x] 3. `src/shared/capture.ts`: `screenshotMonitorIndex` (default `-1`) y
       `screenshotHdrCompatibility` (default **`true`**, ver decisión en el plan) +
       `SCREENSHOT_MONITOR_PRIMARY` + normalización.
- [x] 4. `screenshots.ts`: usar el helper, **borrar** el fallback `?? sources[monitorIndex] ?? sources[0]`
       y devolver `ScreenshotResult`.
- [x] 5. `screenshot-action.ts`: leer `screenshotMonitorIndex` y propagar el motivo del fallo.
- [x] 6. `shared/ipc.ts` + `renderer/__tests__/setup.ts`: forma nueva del resultado de
       `takeScreenshot`. Los tipos del resultado viven en `src/shared/screenshot.ts` (nuevo), porque
       el motivo cruza el IPC; incluye `screenshotFailureMessage` para el aviso al usuario.
- [x] 7. `main/index.ts`: `appendSwitch('disable-features', 'DirectXCapturer')` antes de `ready` si el
       ajuste está activo, y toast con motivo en la acción de la hotkey.
- [x] 7b. `screenshot-hdr.ts`: `debeRelanzarPorHdr(prev, next, state)` + relanzado en `index.ts` con
       `currentExecutablePath()` / `currentAppArgs()` y el diálogo de confirmación.
- [x] 8. `main/ipc.ts`: `CaptureGetDisplays` empareja previews con el mismo helper.
- [x] 9. `Grabacion.tsx`: selector «Monitor de las capturas» con «Seguir al monitor principal», en el
       `fieldset` «Capturas de pantalla» y habilitado solo por `screenshotsEnabled`.
- [x] 10. `Avanzado.tsx`: checkbox «Compatibilidad HDR en capturas de pantalla (convertir a SDR)» +
       nota de reinicio.

## Tests unitarios (obligatorios)

Camino feliz **y** casos borde. Si es un Fix: el test de regresión va primero (rojo → verde).

- [x] regresión — monitor objetivo fuera de `sources` → `{ ok: false, reason: 'monitor-no-capturable' }`,
      **nunca** el índice de otro monitor.
- [x] `-1` resuelve al monitor principal aunque no sea `displays[0]`.
- [x] índice explícito válido → empareja por `display_id` con la fuente correcta.
- [x] empareja por `display_id` y no por orden (el principal llegando segundo entre las fuentes).
- [x] índice fuera de rango / monitor desconectado → `monitor-ausente`.
- [x] ruta GDI (todas las fuentes con `display_id` vacío) → empareja por posición y el aspecto valida.
- [x] ruta GDI: si la posición no valida, encuentra la única fuente compatible por aspecto.
- [x] ruta GDI con cantidades distintas de displays y fuentes → `fuentes-ambiguas`.
- [x] ruta GDI: dos monitores del mismo aspecto → manda la posición.
- [x] ruta GDI: el aspecto tolera el redondeo del thumbnail (1080x1920 → 203x360).
- [x] `sources` vacío → fallo, sin capturar nada.
- [x] `normalizeCaptureSettings`: defaults nuevos; `-1` aceptado; `-2`, `3.5` y `'0'` → default;
      `screenshotHdrCompatibility` no booleano → default (`true`), y `false` explícito se respeta.
- [x] `screenshotMonitorIndex` es independiente: cambiar `screenMonitorIndex` no lo altera.
- [x] renderer — el selector de monitor de capturas persiste `screenshotMonitorIndex` sin tocar
      `screenMonitorIndex`.
- [x] renderer — con `desktopRecordingEnabled: false` y `recordingMode: 'off'`, el selector de
      capturas sigue habilitado (el de grabación de escritorio, no).
- [x] renderer — la casilla de HDR persiste `screenshotHdrCompatibility` sin tocar `hdrCompatibility`.
- [x] `debeRelanzarPorHdr` — sin cambio de valor → false (no relanzar por guardar otros ajustes).
- [x] `debeRelanzarPorHdr` — cambia el valor con `state: 'recording'` → false (no perder la grabación).
- [x] `debeRelanzarPorHdr` — cambia el valor con `state: 'buffering'`, `'idle'`, `'unavailable'` o
      `'initializing'` → true.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 918 tests, 77 archivos.

### Comprobación manual

Equipo del owner: principal **MO27Q28G 2560x1440 con HDR activo** + secundario **ASUS VG24VQE
1080x1920 vertical**. Dos vías: (A) arnés que ejecuta el `takeScreenshot` real dentro de Electron;
(B) la app corriendo (`electron-vite dev --remoteDebuggingPort`), llamando por CDP a
`window.gameclip.capture.*`, o sea el camino completo IPC → acción → captura.

- [x] (A+B) Con la casilla HDR **apagada** y el default: `{ ok: false, reason: 'monitor-no-capturable' }`.
      No se guarda ninguna captura de otro monitor — el bug reportado, arreglado.
- [x] (A+B) Fijar el monitor secundario → captura correcta a **1080x1920** (resolución nativa del
      vertical), verificada visualmente.
- [x] (B) Fijar el monitor de capturas **no** cambia `screenMonitorIndex` (siguió en 0).
- [x] (A+B) Con la casilla HDR **encendida**: captura del principal a **2560x1440**, contenido real y
      colores correctos en SDR, verificada visualmente. Se registra en la biblioteca en la carpeta del
      juego detectado.
- [x] (B) Al arrancar con el ajuste activo aparece el log
      `[app] capturador GDI activado para capturas de pantalla (compatibilidad HDR)`.
- [x] (B) El modal de monitores muestra preview del monitor HDR (antes venía vacía): 102 KB y 14 KB
      de data URL para principal y secundario.
- [x] (B) La UI: el selector «Monitor de las capturas» sale en la sección «Capturas de pantalla» con
      «Seguir al monitor principal» + los dos monitores por su nombre real, y las dos casillas de HDR
      conviven en Avanzado → Captura.

Pendiente de comprobar a mano por el owner (no automatizable sin dejar un diálogo modal abierto en su
pantalla; la lógica está cubierta por los tests de `debeRelanzarPorHdr`):

- [ ] Al togglear la casilla HDR aparece el diálogo y «Reiniciar ahora» relanza la app.
- [ ] Con una grabación en curso, togglear la casilla no relanza y avisa que se aplica al reiniciar.
- [ ] El toast del overlay con el motivo del fallo se ve en pantalla.

## Cierre

- [x] Plan aprobado por el owner (2026-07-29)
- [ ] Aprobación de la entrega
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
