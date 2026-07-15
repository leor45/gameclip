# Plan — Alto del panel del editor avanzado persistente

> **Este plan es un contrato.** Aprobado por el owner (decisión directa: persistir en `localStorage`).
> Alcance fijo.

## Enfoque

El alto del panel es una preferencia **de UI del renderer**, así que va en `localStorage` (donde ya vive
la sesión). La lógica pura (clamp + leer/guardar) se aísla en un módulo testeable; el editor la consume.

**1. Módulo `renderer/lib/editor-prefs.ts` (testeable).**
- `PANEL_MIN = 140`, `PANEL_DEFAULT = 300`; clave `gameclip.editor.panelHeight`.
- `clampPanelHeight(h, max)` — puro: acota a `[PANEL_MIN, max]`; valores no finitos → `PANEL_DEFAULT`.
- `panelMax()` — `Math.max(PANEL_MIN, window.innerHeight - 160)` (mismo margen que hoy).
- `loadPanelHeight()` — lee la clave; si hay un número finito lo devuelve, si no `PANEL_DEFAULT`. (El
  acotado contra el alto de ventana se hace en el editor, con `panelMax()` del momento.)
- `savePanelHeight(h)` — escribe la clave. `try/catch` best-effort (localStorage puede fallar).

**2. Editor (`EditorAvanzado.tsx`).**
- `panelH` inicializa perezoso desde `loadPanelHeight()`.
- Al montar, un efecto acota el valor a `panelMax()` actual (por si la ventana es más chica que cuando se
  guardó), con `clampPanelHeight`.
- `onResizeDown`: usa `clampPanelHeight(next, panelMax())` en el `move` (reemplaza el min/max inline de
  hoy) y en `up` **guarda** el último valor con `savePanelHeight`.

## Archivos / módulos afectados

- `src/renderer/lib/editor-prefs.ts` *(nuevo)* — constantes, `clampPanelHeight`, `panelMax`,
  `loadPanelHeight`, `savePanelHeight`.
- `src/renderer/lib/__tests__/editor-prefs.test.ts` *(nuevo)* — clamp (mín/máx/no finito/defecto),
  load/save con `localStorage`.
- `src/renderer/views/EditorAvanzado.tsx` — init perezoso + efecto de acotado + guardar al soltar.
- `src/renderer/__tests__/editor-avanzado.test.tsx` — arrastrar el divisor guarda en `localStorage` y al
  re-montar el panel arranca con ese alto.

## Decisiones y alternativas consideradas

- **`localStorage`, no `capture-settings.json`.** Es una pref de UI del renderer; meterla en el settings
  de captura obligaría a canal IPC + esquema + migración para algo que el renderer guarda solo. Mismo
  comportamiento visible, mucha menos superficie. (Decisión del owner.)
- **Guardar al soltar, no en cada `pointermove`.** Un `setItem` por frame de arrastre es ruido; basta el
  valor final.
- **Acotar al leer contra la ventana actual.** Un alto guardado con una ventana grande no debe dejar el
  panel fuera en una ventana chica; se re-acota al montar y en cada arrastre.

## Riesgos

- **`localStorage` no disponible/con error** (modo restringido): `save` es best-effort (`try/catch`) y
  `load` cae al defecto. No rompe el editor.
- **Ventana redimensionada mientras el editor está abierto:** el acotado por arrastre usa `panelMax()` del
  momento; no re-acotamos en vivo al cambiar el tamaño de ventana (fuera de alcance, poco frecuente).

---

**Estado:** ✅ aprobado por el owner el 2026-07-14 (persistir en `localStorage`).
