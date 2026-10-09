# Tasks — Los editores se quedan colgados si el IPC de exportar rechaza

## Tests unitarios (obligatorios; primero, en rojo)

- [x] Regresión Editor: `exporter.run` rechaza → mensaje y botón «Exportar…» de vuelta.
- [x] Regresión EditorAvanzado: `exporter.run` rechaza → error en el modal y botón de render de vuelta.

## Implementación

- [x] 1. `ipc.ts`: `ExportRun` devuelve `{status:'error'}` si el pedido no valida.
- [x] 2. `Editor.tsx` y `EditorAvanzado.tsx`: `try/catch` alrededor de `exporter.run`.

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
