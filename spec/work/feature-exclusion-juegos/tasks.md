# Tasks — Lista de «no son juegos» (sincronizada y manual)

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. Dominio en `shared/games.ts`: `ExcludedGame`, `NON_GAME_APPS`, `autoExclusions`, `syncExcludedGames`, `activeExcludedNames`.
- [x] 2. Ajuste `excludedGames` + `normalizeExcludedGames` en `shared/capture.ts`.
- [x] 3. `steamAppId` en `InstalledGame` y en la fuente de Steam.
- [x] 4. `GameIndexService`: opción `exclusions`, filtro antes de indexar, huella con la lista, `installed()`.
- [x] 5. Main: sincronización y guardado sin rebuild; IPC `games:list-installed` y `games:set-excluded`; preload.
- [x] 6. UI «No son juegos» en Ajustes → Grabación (lista, activo, quitar, añadir, Sincronizar).

## Tests unitarios (obligatorios)

- [x] `autoExclusions` matchea por appid y por nombre; no matchea un juego normal.
- [x] `syncExcludedGames`: añade auto nuevo · **salta** si ya hay manual con el mismo nombre (mayúsculas distintas) · respeta un auto desactivado · quita auto desinstalado · nunca quita manual.
- [x] `normalizeCaptureSettings` normaliza/deduplica `excludedGames` y tolera basura.
- [x] Steam: el `appid` del manifiesto llega a `steamAppId`.
- [x] `GameIndexService`: un juego excluido no aporta exes; un exe compartido con un excluido NO se vuelve ambiguo; cambiar la lista cambia la huella.
- [x] UI: lista con etiquetas auto/manual; añadir manual llama a `setExcluded`; «Sincronizar» llama a `rescan`.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`)
- [x] Comprobación manual: Sincronizar → Wallpaper Engine y Lossless Scaling aparecen como *auto*; desaparecen del índice (Ajustes → Desarrollo); añadir uno a mano antes de sincronizar deja una sola entrada *manual*.

## Cierre

- [x] Aprobación del owner
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
