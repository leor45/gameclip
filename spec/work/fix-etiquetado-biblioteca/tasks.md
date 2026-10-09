# Tasks — Juegos mal etiquetados en la biblioteca

## Tests de regresión (primero, en rojo)

- [x] `relabelGames` con un clip fuera de `outputDir` (misma unidad) → conserva su juego.
- [x] `relabelGames` con un clip en otra unidad → conserva su juego.
- [x] `registerSavedClip(path, 'replay', null)` con una ventana activa → `game: null`.

## Implementación

- [x] 1. `gameFromPath` → `undefined` fuera de `outputDir`; `relabelGames` lo salta.
- [x] 2. `registerSavedClip` sin fallback por ventana; quitar `getForegroundTitle` de `LibraryOptions` e `index.ts`.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`)
- [x] Comprobación manual: cambiar la carpeta de clips y ver que el filtro de juegos no muestra `..` ni letras de unidad; grabar escritorio con el navegador delante → «Sin juego».

## Cierre

- [x] Aprobación del owner
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
