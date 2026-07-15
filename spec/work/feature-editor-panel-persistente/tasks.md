# Tasks — Alto del panel del editor avanzado persistente

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. `renderer/lib/editor-prefs.ts`: `PANEL_MIN`/`PANEL_DEFAULT`, clave, `clampPanelHeight`,
      `panelMax`, `loadPanelHeight`, `savePanelHeight` (best-effort).
- [x] 2. `EditorAvanzado.tsx`: init perezoso de `panelH` desde `loadPanelHeight()`; efecto de acotado al
      montar; `onResizeDown` acota con `clampPanelHeight` y guarda al soltar.

## Tests unitarios (obligatorios)

- [x] `editor-prefs`: `clampPanelHeight` acota a mín/máx; no finito → defecto.
- [x] `editor-prefs`: `loadPanelHeight` devuelve el guardado, o el defecto si no hay nada / es inválido.
- [x] `editor-prefs`: `savePanelHeight` escribe la clave.
- [x] `editor-avanzado.test.tsx`: arrastrar el divisor guarda el alto en `localStorage`; re-montar el
      editor arranca con ese alto.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 715 tests (+6)
- [x] Comprobación manual: arrastrar el divisor, cerrar y reabrir el editor (y con otro clip) mantiene el
      alto; un alto imposible en una ventana chica se acota. **E2E OK del owner ("está funcionando").**

## Cierre

- [x] Aprobación del owner
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
