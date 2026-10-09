# Tasks — El filtro por juego se queda pegado cuando el juego desaparece del catálogo

## Tests unitarios (obligatorios; primero, en rojo)

- [x] Regresión: filtrar por un juego, que desaparezca de `games()` tras un `changed` → la consulta
      vuelve sin `game` y el select vale «Todos los juegos».

## Implementación

- [x] 1. `Biblioteca.tsx`: soltar el filtro si el juego ya no está en la lista.

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes

## Cierre

- [x] Aprobación del owner
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
