# Tasks — Exportar encima del propio clip lo borra

## Tests de regresión (primero, en rojo)

- [x] `run` con `outputPath === inputPath` → error, ffmpeg no se lanza y el archivo de entrada sigue existiendo.
- [x] Igual con distinta capitalización / separadores.
- [x] Un fallo de ffmpeg con destino distinto sigue borrando el parcial.

## Implementación

- [x] 1. `mismoArchivo` y rechazo temprano en `ExportManager.run`.
- [x] 2. `removePartial` no borra si el destino es la entrada.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`)
- [ ] Comprobación manual: Editor → Exportar → elegir el propio clip → mensaje de error y el clip sigue en la biblioteca.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
