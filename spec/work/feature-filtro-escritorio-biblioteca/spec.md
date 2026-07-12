# Spec — Filtro "Escritorio" en la biblioteca

**Tipo:** Feature
**Rama:** `feature/filtro-escritorio-biblioteca`
**Fecha:** 2026-07-11

## Problema / Objetivo

El filtro por juego de la biblioteca solo lista los juegos que aparecen en el catálogo. Las
grabaciones que **no** vienen de un juego (grabación de escritorio, capturas manuales sin juego
detectado) tienen `game = NULL`, así que hoy no hay forma de aislarlas: o se ven todas, o se filtra
por un juego concreto. Con la organización nueva (esas grabaciones viven en la carpeta `Desktop/`),
tiene sentido poder filtrarlas igual que un juego más.

## Alcance

**Dentro:**

- Opción **Escritorio** en el desplegable de filtro de la biblioteca, que muestra solo los clips sin
  juego (`game IS NULL`).
- Soporte en el catálogo: la consulta de clips admite "sin juego" como criterio, distinto de "no
  filtrar".

**Fuera (explícito):**

- Reasignar el juego de un clip desde la UI (ya existe el campo de juego al editar la tarjeta).
- Filtrar por carpeta del disco: el criterio es el juego del catálogo, no dónde está el archivo
  (aunque con el layout nuevo coincidan).
- Filtros combinados (juego + escritorio a la vez): el desplegable sigue siendo de selección única.

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] El desplegable de la biblioteca ofrece "Escritorio" junto a "Todos los juegos" y los juegos
      del catálogo.
- [ ] Elegir "Escritorio" muestra solo los clips sin juego, y ninguno de los que tienen juego.
- [ ] Elegir un juego concreto sigue funcionando igual, y "Todos los juegos" muestra todo.
- [ ] El filtro convive con la búsqueda por texto y con "Favoritos" (se aplican juntos).
- [ ] Un clip cuyo juego se llame literalmente "Escritorio" no se confunde con el filtro sin juego.
- [ ] Gates verdes: `npm run typecheck`, `npm run lint`, `npm run test`.
