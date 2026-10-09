# Tasks — Guardar ajustes que no afectan a la captura vaciaba el buffer

## Tests unitarios (obligatorios; primero, en rojo)

- [x] Regresión BUG-7: `setSettings({ perfOverlayVisible })` no reconstruye ni para el buffer.
- [x] `recordingMode: 'off'` para el buffer sin rebuild; `manual` lo arranca sin rebuild.
- [x] `quality` sigue reconstruyendo; grabando, se aplaza.
- [x] Regresión BUG-4: `micEnabled: false` grabando mutea en el acto.
- [x] `PIPELINE_SETTING_KEYS` contiene toda clave `settings.x` leída en `obs.ts`.

## Implementación

- [x] 1. Catálogo y `settingsChanged` en `@shared/capture`.
- [x] 2. `setSettings` por categorías + `applyMicMute()` siempre.
- [x] 3. Selftest con `showMouseCursor`.

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
