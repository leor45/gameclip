# Spec — Guardar ajustes que no afectan a la captura vaciaba el buffer; el mute del micro no se aplicaba grabando

**Tipo:** Fix
**Rama:** `fix/ajustes-sin-rebuild`
**Fecha:** 2026-10-08

## Problema / Objetivo

Auditoría bug-hunter B, BUG-7 y BUG-4. `CaptureManager.setSettings` reconstruye el pipeline de libobs
**siempre** que no se esté grabando, sea cual sea el ajuste guardado. Reconstruir destruye el replay
buffer y con él los últimos segundos:

- **BUG-7 (Medium):** el atajo del overlay de rendimiento persiste `perfOverlayVisible` con
  `setSettings`; pulsarlo a mitad de partida vacía el buffer y el replay siguiente sale corto. Lo mismo
  al guardar atajos, almacenamiento, overlay o auto-inicio desde Ajustes. El propio `index.ts` lo
  documenta para las exclusiones y lo esquiva escribiendo en `settingsStore` directo.
- **BUG-4 (Low):** con una grabación en curso, `setSettings` solo marca `pendingRebuild`; apagar el
  micrófono (o activar PTT) no surte efecto hasta parar, aunque `setMicMuted` es una operación en
  caliente.

**Causa raíz:** `setSettings` no distingue qué ajustes exigen reconstruir el pipeline, cuáles solo
cambian si el buffer debe correr, cuáles se aplican en caliente y cuáles no tocan la captura.

## Alcance

**Dentro:**
- `@shared/capture`: catálogo `PIPELINE_SETTING_KEYS` (lo que lee `buildPipeline`) y
  `BUFFER_SETTING_KEYS` (`recordingMode`, `bufferMode`), con `settingsChanged(prev, next, keys)`.
- `setSettings`: reconstruir solo si cambió una clave de pipeline (aplazado si graba); si solo cambió
  una de buffer, reconciliar el buffer sin reconstruir; aplicar el mute del micro en caliente siempre.
- Selftest `GAMECLIP_SELFTEST_REBUILDS`: alternar `showMouseCursor` (ajuste de pipeline) en vez de
  `setSettings({})`, que ya no reconstruye.
- Tests de regresión.

**Fuera (explícito):**
- Aplicar en caliente volúmenes o dispositivo del micro (siguen reconstruyendo).
- Que la UI de Ajustes mande solo las claves editadas: ya lo hace (`useCaptureSettings`).

## Criterios de aceptación

- [ ] `setSettings({ perfOverlayVisible })` con el buffer activo no llama a `buildPipeline` ni para el
      buffer.
- [ ] `setSettings({ recordingMode: 'off' })` para el buffer sin reconstruir; volver a `manual` lo
      arranca sin reconstruir.
- [ ] `setSettings({ quality })` sigue reconstruyendo (y aplazándose si se graba).
- [ ] Durante una grabación, `setSettings({ micEnabled: false })` mutea el micro en el acto.
- [ ] Suite verde.
