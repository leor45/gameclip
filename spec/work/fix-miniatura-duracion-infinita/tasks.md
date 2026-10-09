# Tasks — Un vídeo sin duración en la cabecera deja las miniaturas en bucle

## Tests unitarios (obligatorios; primero, en rojo)

- [x] Regresión: un clip con duración `Infinity` no se reextrae tras recargar la lista y el siguiente
      pendiente sí recibe su miniatura.

## Implementación

- [x] 1. `useThumbnailer`: duración no finita → `fallidos`.

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
