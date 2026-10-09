# Tasks — Los ajustes se escriben sin atomicidad

## Tests unitarios (obligatorios; primero, en rojo)

- [x] `save` no deja `.tmp` y el principal parsea.
- [x] Regresión: principal truncado + `.bak` válido → `load()` recupera del `.bak`.
- [x] Un principal corrupto no se copia al `.bak`.

## Implementación

- [x] 1. `leer()`, `load` con fallback, `save` con tmp + bak + rename.

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
