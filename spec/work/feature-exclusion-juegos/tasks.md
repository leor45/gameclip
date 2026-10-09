# Tasks — Lista de «no son juegos» (sincronizada y manual)

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [ ] 1. Dominio en `shared/games.ts`: `ExcludedGame`, `NON_GAME_APPS`, `autoExclusions`, `syncExcludedGames`, `activeExcludedNames`.
- [ ] 2. Ajuste `excludedGames` + `normalizeExcludedGames` en `shared/capture.ts`.
- [ ] 3. `steamAppId` en `InstalledGame` y en la fuente de Steam.
- [ ] 4. `GameIndexService`: opción `exclusions`, filtro antes de indexar, huella con la lista, `installed()`.
- [ ] 5. Main: sincronización y guardado sin rebuild; IPC `games:list-installed` y `games:set-excluded`; preload.
- [ ] 6. UI «No son juegos» en Ajustes → Grabación (lista, activo, quitar, añadir, Sincronizar).

## Tests unitarios (obligatorios)

- [ ] `autoExclusions` matchea por appid y por nombre; no matchea un juego normal.
- [ ] `syncExcludedGames`: añade auto nuevo · **salta** si ya hay manual con el mismo nombre (mayúsculas distintas) · respeta un auto desactivado · quita auto desinstalado · nunca quita manual.
- [ ] `normalizeCaptureSettings` normaliza/deduplica `excludedGames` y tolera basura.
- [ ] Steam: el `appid` del manifiesto llega a `steamAppId`.
- [ ] `GameIndexService`: un juego excluido no aporta exes; un exe compartido con un excluido NO se vuelve ambiguo; cambiar la lista cambia la huella.
- [ ] UI: lista con etiquetas auto/manual; añadir manual llama a `setExcluded`; «Sincronizar» llama a `rescan`.

## Verificación (gates)

- [ ] Type-check verde (`npm run typecheck`)
- [ ] Lint verde (`npm run lint`)
- [ ] Tests verdes (`npm run test`)
- [ ] Comprobación manual: Sincronizar → Wallpaper Engine y Lossless Scaling aparecen como *auto*; desaparecen del índice (Ajustes → Desarrollo); añadir uno a mano antes de sincronizar deja una sola entrada *manual*.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
