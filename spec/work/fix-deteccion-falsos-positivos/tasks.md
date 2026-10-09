# Tasks — Falsos positivos en la detección de juegos

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Tests de regresión (primero, en rojo)

- [x] `parseUninstallEntries` con la entrada real de REDlauncher → `[]`.
- [x] `parseUninstallEntries` con «Rockstar Games Social Club» y un «… Updater» → descartados; un juego de CD Projekt sigue entrando.
- [x] `executablesIn` sobre una carpeta con `QtWebEngineProcess.exe`, `7za.exe`, `createdump.exe`, `crs-handler.exe` → solo el exe del juego.
- [x] `GameIndexService` con el mismo juego por dos fuentes (`…\Moonlighter` y `…\Moonlighter\`) → un solo juego en la huella.

## Implementación

- [x] 1. Patrón `ES_HERRAMIENTA` en `uninstall-registry.ts` (nombre y última carpeta).
- [x] 2. Exes de runtime en `EXES_IGNORADOS` (`scan.ts`).
- [x] 3. Clave canónica en el dedupe de `listarJuegos` (`index.ts`).

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`)
- [ ] Comprobación manual: con GOG Galaxy abierto la barra dice «Esperando juego»; el `games-index.json` reconstruido ya no tiene `qtwebengineprocess` ni `REDlauncher`.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
