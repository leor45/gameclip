# Tasks — «No son juegos»: guardar la lista pisa la recién sincronizada

## Tests de regresión (primero, en rojo; comprobado contra la lógica vieja)

- [x] `setExcludedAndRefresh` devuelve la lista posterior al refresco (rojo con la lógica vieja:
      devolvía la calculada antes).
- [x] Guarda antes de refrescar.
- [x] Refresco que rechaza / lanza en síncrono → resuelve con la lista guardada (rojo con la lógica
      vieja: rechazaba).
- [x] Guardado que falla → rechaza y no refresca.
- [x] Renderer: `setExcluded` que rechaza → la lista se recarga de `getSettings` (rojo antes del
      arreglo: se quedaba la optimista).

## Implementación

- [x] 1. `src/main/games/exclusions.ts` con `setExcludedAndRefresh`.
- [x] 2. Cablear `setExcluded` en `src/main/index.ts`.
- [x] 3. `guardar` de `NoSonJuegos.tsx` con recarga ante rechazo.
- [x] 4. Verificar (sin cambiar) la cola de refrescos de `GameIndexService`: ver `plan.md`.

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes

## Cierre

- [x] Aprobación del owner
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
