# Tasks — Comprobar actualizaciones

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. `@shared/version.ts`: `compareVersions` / `isNewer` (parse `X.Y.Z`, numérico).
- [x] 2. `src/main/updates.ts`: `checkForUpdates(current, deps?)` con `net`, timeout y catch total.
- [x] 3. `@shared/ipc.ts`: canal `AppCheckUpdate` + tipo `UpdateCheckResult` + contrato.
- [x] 4. `src/main/ipc.ts` handler + `src/preload/index.ts` `checkForUpdate()` (release vía `window.open`).
- [x] 5. `UpdateContext`: chequeo de arranque una vez, flag del modal, `comprobar()` manual.
- [x] 6. `UpdateModal` (solo arranque) + montaje en `App` con `UpdateProvider`.
- [x] 7. `Sidebar`: aviso pasivo + botón "Comprobar actualizaciones" con estado; estilos en `styles.css`.

## Tests unitarios (obligatorios)

- [x] `version.test.ts`: orden `0.6.0 > 0.5.10 > 0.5.2 > 0.5.1`; igual → no newer; sufijos/faltantes.
- [x] `updates.test.ts`: respuesta con tag mayor → `updateAvailable` + url; igual/menor → false;
      red que falla / JSON inválido → false sin lanzar; null → false.
- [x] Renderer: el botón manual llama al IPC y refleja "al día" vs "hay update"; el aviso pasivo
      aparece con update; el modal de arranque sale una vez y "Ver release" abre el enlace.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 584/584
- [x] Comprobación manual: modal al arrancar + aviso pasivo + botón, verificado por el owner. ✅

## Cierre

- [x] Aprobación del owner
- [x] Bump a **0.6.0** + notas de release (✨ Novedades / 🐛 Mejoras y estabilización)
- [x] Merge a `main` con `--no-ff` (fix de borrado + esta feature) y ramas borradas (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
- [x] Release `v0.6.0` publicado con `GameClip-0.6.0-portable.exe`
