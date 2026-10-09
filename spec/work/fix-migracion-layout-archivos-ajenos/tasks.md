# Tasks — La migración del layout viejo mueve y renombra archivos del usuario

## Tests unitarios (obligatorios; primero, en rojo)

- [x] Regresión: un archivo `scan` suelto en la raíz no se mueve ni se renombra.

## Implementación

- [x] 1. `migrateClipLayout` salta `source === 'scan'`.

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes

## Cierre

- [x] Aprobación del owner
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
