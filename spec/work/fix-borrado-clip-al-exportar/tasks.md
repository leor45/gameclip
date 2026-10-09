# Tasks — Exportar encima del propio clip lo borra

## Tests de regresión (primero, en rojo)

- [ ] `run` con `outputPath === inputPath` → error, ffmpeg no se lanza y el archivo de entrada sigue existiendo.
- [ ] Igual con distinta capitalización / separadores.
- [ ] Un fallo de ffmpeg con destino distinto sigue borrando el parcial.

## Implementación

- [ ] 1. `mismoArchivo` y rechazo temprano en `ExportManager.run`.
- [ ] 2. `removePartial` no borra si el destino es la entrada.

## Verificación (gates)

- [ ] Type-check verde (`npm run typecheck`)
- [ ] Lint verde (`npm run lint`)
- [ ] Tests verdes (`npm run test`)
- [ ] Comprobación manual: Editor → Exportar → elegir el propio clip → mensaje de error y el clip sigue en la biblioteca.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
