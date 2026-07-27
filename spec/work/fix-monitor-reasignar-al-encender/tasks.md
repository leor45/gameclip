# Tasks — Reasignar el monitor de escritorio al encender la pantalla

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. Doble de test: `FakeObs.buildPipeline` guarda el `DisplayInfo` recibido y `crear()` acepta
      un `displayByIndex` controlable desde el test.
- [x] 2. `CaptureManager`: campo `builtDisplay`, helper `resolveTargetDisplay()` y método público
      `displaysChanged()` (no-op si el display no cambió · `pendingRebuild` si se está grabando ·
      `queueRebuild()` si no); `rebuildPipeline` usa el helper y guarda el display.
- [x] 3. `src/main/index.ts`: suscribir `display-added` / `display-removed` /
      `display-metrics-changed` con debounce ~2 s → `displaysChanged()`, y limpiar listeners + timer
      en el teardown.

## Tests unitarios (obligatorios)

Camino feliz **y** casos borde. Si es un Fix: el test de regresión va primero (rojo → verde).

- [x] Regresión: monitor seleccionado ausente al `initialize()` → aparece → `displaysChanged()`
      reconstruye el pipeline con el display seleccionado.
- [x] Caso borde: display resuelto idéntico → `displaysChanged()` no reconstruye (no vacía el búfer).
- [x] Caso borde: con grabación en curso el rebuild se difiere y se aplica al parar la grabación.
- [x] Caso borde: el monitor seleccionado desaparece → se reconstruye con el fallback disponible.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`)
- [ ] Comprobación manual (owner): con GameClip corriendo y el OLED apagado, encenderlo y grabar escritorio
      sin tocar Ajustes → el clip sale del OLED. Apagarlo → cae al secundario en vez de grabar negro.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
