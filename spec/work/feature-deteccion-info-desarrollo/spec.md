# Spec — Contador de juegos y detalle de detección en Desarrollo

**Tipo:** Feature (mejora de UI de ajustes)
**Rama:** `feature/deteccion-info-desarrollo`
**Fecha:** 2026-07-15

## Problema / Objetivo

En Ajustes → Grabación → "Detección de juegos" el hint dice *"…se detectan solos: **66 ejecutables
reconocidos**"*. Dos problemas:

1. **"Ejecutables" no es lo que el usuario espera.** Un juego aporta varios `.exe` al índice (Wallpaper
   Engine mete ~25 él solo), así que el número está inflado y confunde: el log real distingue
   *"31 juegos, 66 ejecutables"*. El recuento de ejecutables es un detalle **interno** de la detección.
2. Ese dato técnico vive en la pantalla de uso normal, donde no aporta.

**Objetivo:** que la pantalla de Grabación muestre un recuento de **juegos** (claro para el usuario), y
que el detalle técnico (recuento de ejecutables + el mapa `ejecutable → juego`) viva en Ajustes →
**Desarrollo** como información **desplegable y colapsada por defecto**, útil para diagnóstico.

## Alcance

**Dentro:**

- **Grabación → Detección**: el hint pasa a contar **juegos distintos** del índice
  (`new Set(Object.values(index)).size`) en vez de ejecutables. El botón "Volver a escanear…" se queda.
- **Desarrollo**: nuevo bloque `<details>` (colapsado por defecto) titulado con el recuento
  (`N juegos · M ejecutables`), y dentro una tabla `ejecutable → juego` ordenada. Solo informativo
  (lectura), se nutre de `window.gameclip.games.getIndex()`.

**Fuera (explícito):**

- Cambiar la lógica de detección, el índice o las fuentes: es solo presentación.
- Editar el índice desde la UI (dar de baja ejecutables, etc.): es un visor de solo lectura.
- Tocar el flujo de alta manual de juegos (sigue igual en Grabación).

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] Grabación → Detección muestra "N **juegos** reconocidos" (no ejecutables); N = juegos distintos
      del índice.
- [ ] Ajustes → Desarrollo tiene un desplegable **colapsado por defecto** con el detalle
      `N juegos · M ejecutables` y la tabla `ejecutable → juego`.
- [ ] El desplegable refleja el índice real y no rompe si el índice está vacío (primer arranque).
- [ ] No cambia nada de la detección ni del alta manual (sin regresión).
- [ ] Gates verdes: type-check · lint · tests (incluido el ajuste de los tests de Grabación que
      comprobaban el texto anterior).
