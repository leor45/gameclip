# Tasks — Juegos mal etiquetados en la biblioteca

## Tests de regresión (primero, en rojo)

- [ ] `relabelGames` con un clip fuera de `outputDir` (misma unidad) → conserva su juego.
- [ ] `relabelGames` con un clip en otra unidad → conserva su juego.
- [ ] `registerSavedClip(path, 'replay', null)` con una ventana activa → `game: null`.

## Implementación

- [ ] 1. `gameFromPath` → `undefined` fuera de `outputDir`; `relabelGames` lo salta.
- [ ] 2. `registerSavedClip` sin fallback por ventana; quitar `getForegroundTitle` de `LibraryOptions` e `index.ts`.

## Verificación (gates)

- [ ] Type-check verde (`npm run typecheck`)
- [ ] Lint verde (`npm run lint`)
- [ ] Tests verdes (`npm run test`)
- [ ] Comprobación manual: cambiar la carpeta de clips y ver que el filtro de juegos no muestra `..` ni letras de unidad; grabar escritorio con el navegador delante → «Sin juego».

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
