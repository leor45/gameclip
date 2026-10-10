# Tasks — Editor avanzado: timeline por trozos (tipo DaVinci)

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. `trimSegmentEdge` en `shared/timeline.ts` (tests primero).
- [x] 2. Fotogramas uniformes sobre el origen + `useFilmstripFrames` + `FilmstripBlock`.
- [x] 3. `Timeline` en dos columnas con pistas como datos y un bloque por segmento y pista.
- [x] 4. Asas por bloque (ratón y teclado) conectadas al historial (un paso por arrastre).
- [x] 5. `AudioTrackHead` (icono, nombre, volumen visible, quitar/restaurar) y onda por bloque.
- [x] 6. Barra de herramientas con iconos SVG; estilos de bloques, selección, huecos y transición.
- [x] 7. Verificación en la app real (CDP / capturas): dividir, recortar bordes, borrar, volumen.

## Tests unitarios (obligatorios)

- [x] `trimSegmentEdge`: inicio/fin, vecinos, mínimo, extremos 0/duración, índice inválido.
- [x] Timeline: un bloque por segmento en cada pista; selección marcada en todas.
- [x] Recortar un trozo intermedio con el teclado cambia solo ese trozo; deshacer lo revierte.
- [x] Volumen y quitar/restaurar intactos desde la cabecera.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`)
- [x] Comprobación manual: en la app real, dividir, recortar bordes, seleccionar y volumen (el render con trozos lo cubren los tests; no se lanzó un render real).

## Cierre

- [x] Aprobación del owner (2026-10-10)
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`) — publicado en v1.0.0
- [x] `spec/constitution/roadmap.md` actualizado
