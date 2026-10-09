# Tasks — Editor avanzado: salir mientras carga el audio y ▶ tras el final recortado

## Tests unitarios (obligatorios; primero, en rojo)

- [x] Regresión (D6-BUG-1): salir con la carga del audio pendiente → al terminar, ni `play()` ni
      `muted` sobre el `<video>` desmontado, ni audio en vivo.
- [x] Regresión (D6-BUG-2): final recortado, llegar al final y ▶ → vuelve a 0 y sigue reproduciendo.
- [x] Regresión (D6-BUG-2, audio en vivo): vuelve al inicio del primer tramo (5 s); el audio no
      arranca mientras el vídeo busca y arranca una sola vez en 5 s al aterrizar.
- [x] Regresión (■ anula el salto): ■ durante el reinicio, y ■ durante el salto del principio
      recortado → el siguiente ▶ salta lo recortado.
- [x] No-regresión: con el editor abierto, al terminar la carga ▶ arranca (vídeo mudo y audio desde
      el cursor) y ❚❚ pausa; ▶ en mitad de un tramo no reposiciona; en un hueco el bucle salta como
      siempre; un clip sin recortar vuelve a 0 al terminar.

## Implementación

- [x] 1. `togglePlay`: guard `videoRef.current !== v` tras la carga del audio.
- [x] 2. `togglePlay`: reinicio al primer tramo; el audio en vivo lo arranca el bucle al aterrizar.
- [x] 3. `stop()`: anula el salto pendiente.

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes (83 archivos, 1065 tests)

## Cierre

- [ ] Aprobación del owner
- [ ] Comprobación manual en la app: salir durante «Cargando audio…» (clip largo) y ▶ tras llegar al
      final recortado (con y sin principio recortado)
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
