# Tasks — Un rebuild encolado al empezar a grabar destruye la grabación

## Tests unitarios (obligatorios; primero, en rojo)

- [x] Regresión: ajuste de pipeline durante el arranque de la grabación → sin rebuild, sigue
      grabando, el cambio se aplica al parar.
- [x] Regresión: cambio de `bufferMode` durante el arranque → estado 'recording', buffer parado.
- [x] Regresión: cambio de monitor durante el arranque → aplazado hasta parar.

## Implementación

- [x] 1. `queueRebuild` decide dentro de la tarea.
- [x] 2. Rama de buffer de `setSettings` con la comprobación dentro de la tarea.
- [x] 3. `displaysChanged` sin decisión previa.

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
