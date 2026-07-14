# Tasks — Auto-inicio con Windows no arranca (portable)

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Tests (regresión primero — rojo → verde)

- [x] Test: con `PORTABLE_EXECUTABLE_FILE` definido, `path` = esa ruta (rojo con el código actual).
- [x] Test: sin `PORTABLE_EXECUTABLE_FILE`, `path` = `execPath`.
- [x] Test: `args` incluye `--hidden` y `openAtLogin` refleja el ajuste (true/false).

## Implementación

- [x] 1. `src/main/auto-launch.ts` con `loginItemSettings(autoLaunch, env, execPath)`.
- [x] 2. `applyAutoLaunch` en `index.ts` usa la función pura.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 600 pasan
- [x] Bump de versión a 0.7.1 en `package.json`.
- [ ] Comprobación manual: build portable, activar el ajuste, reiniciar sesión → arranca en bandeja.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
