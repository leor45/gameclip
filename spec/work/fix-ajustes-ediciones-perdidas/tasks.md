# Tasks — Ediciones de Ajustes que se pierden (durante un guardado y al renombrar con Enter)

## Tests unitarios (obligatorios; primero, en rojo)

- [x] Regresión (C4-BUG-2): otra clave y la clave enviada re-editadas durante el guardado conservan
      su valor, siguen pendientes (`saved` false) y el siguiente guardado las manda.
- [x] Regresión (C4-BUG-4): Enter en el nombre no envía el formulario; al guardar va el nombre nuevo.

## Implementación

- [x] 1. `useCaptureSettings`: ediciones con contador y fusión tras guardar.
- [x] 2. `Grabacion.tsx`: Enter confirma el renombre.

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes

## Cierre

- [x] Aprobación del owner
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
