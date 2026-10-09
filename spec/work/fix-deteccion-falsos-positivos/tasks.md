# Tasks — Falsos positivos en la detección de juegos

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Tests de regresión (primero, en rojo)

- [ ] `parseUninstallEntries` con la entrada real de REDlauncher → `[]`.
- [ ] `parseUninstallEntries` con «Rockstar Games Social Club» y un «… Updater» → descartados; un juego de CD Projekt sigue entrando.
- [ ] `executablesIn` sobre una carpeta con `QtWebEngineProcess.exe`, `7za.exe`, `createdump.exe`, `crs-handler.exe` → solo el exe del juego.
- [ ] `GameIndexService` con el mismo juego por dos fuentes (`…\Moonlighter` y `…\Moonlighter\`) → un solo juego en la huella.

## Implementación

- [ ] 1. Patrón `ES_HERRAMIENTA` en `uninstall-registry.ts` (nombre y última carpeta).
- [ ] 2. Exes de runtime en `EXES_IGNORADOS` (`scan.ts`).
- [ ] 3. Clave canónica en el dedupe de `listarJuegos` (`index.ts`).

## Verificación (gates)

- [ ] Type-check verde (`npm run typecheck`)
- [ ] Lint verde (`npm run lint`)
- [ ] Tests verdes (`npm run test`)
- [ ] Comprobación manual: con GOG Galaxy abierto la barra dice «Esperando juego»; el `games-index.json` reconstruido ya no tiene `qtwebengineprocess` ni `REDlauncher`.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
