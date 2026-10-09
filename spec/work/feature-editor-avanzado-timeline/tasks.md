# Tasks — Editor avanzado: timeline por trozos (tipo DaVinci)

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [ ] 1. `trimSegmentEdge` en `shared/timeline.ts` (tests primero).
- [ ] 2. Fotogramas uniformes sobre el origen + `useFilmstripFrames` + `FilmstripBlock`.
- [ ] 3. `Timeline` en dos columnas con pistas como datos y un bloque por segmento y pista.
- [ ] 4. Asas por bloque (ratón y teclado) conectadas al historial (un paso por arrastre).
- [ ] 5. `AudioTrackHead` (icono, nombre, volumen visible, quitar/restaurar) y onda por bloque.
- [ ] 6. Barra de herramientas con iconos SVG; estilos de bloques, selección, huecos y transición.
- [ ] 7. Verificación en la app real (CDP / capturas): dividir, recortar bordes, borrar, volumen.

## Tests unitarios (obligatorios)

- [ ] `trimSegmentEdge`: inicio/fin, vecinos, mínimo, extremos 0/duración, índice inválido.
- [ ] Timeline: un bloque por segmento en cada pista; selección marcada en todas.
- [ ] Recortar un trozo intermedio con el teclado cambia solo ese trozo; deshacer lo revierte.
- [ ] Volumen y quitar/restaurar intactos desde la cabecera.

## Verificación (gates)

- [ ] Type-check verde (`npm run typecheck`)
- [ ] Lint verde (`npm run lint`)
- [ ] Tests verdes (`npm run test`)
- [ ] Comprobación manual: en la app real, dividir, recortar bordes, borrar, volumen y render.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
