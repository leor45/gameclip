# Tasks — Build portable (.exe) con la API embebida

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. `LICENSE` con el texto de GPL-3.0; `package.json` pasa de `UNLICENSED` a `GPL-3.0`.
- [x] 2. `bcrypt` → `bcryptjs` en `server/auth/auth.service.ts` (y en las dependencias).
- [x] 3. `server/db/database.ts`: `openDatabase(driver, path)` — sin `import` de `better-sqlite3`
       (solo `import type`), para que el bundle del main no arrastre el binario con ABI de Node.
- [x] 4. `server/api.ts`: `startApi({ driver, dbPath, port, onError })` → abre la DB, monta la app y
       escucha; devuelve un handle con `close()`.
- [x] 5. `server/index.ts` (entrypoint de `dev:server`) usa `startApi` con el driver de Node.
- [x] 6. `src/main/paths.ts`: `unpackedPath()` — reescribe `app.asar` → `app.asar.unpacked`.
- [x] 7. `src/main/capture/obs.ts` y `src/main/index.ts`: `unpackedPath` sobre el directorio de osn y
       sobre `ffmpegPath`.
- [x] 8. `src/main/index.ts`: lock de instancia única + arranque de la API en `ready` (antes de la
       ventana) + `close()` en `will-quit`; diálogo en español si el puerto está ocupado.
- [x] 9. `electron-builder.yml` (target `portable`, `asarUnpack` de osn / ffmpeg / `.node`, licencias
       en `extraResources`, `npmRebuild: false`) y script `build:portable` en `package.json`. La
       config va en YAML y no en el `package.json`: electron-builder valida el schema y rechaza
       claves desconocidas, así que no admitía las notas del porqué; en YAML son comentarios.

## Tests unitarios (obligatorios)

- [x] `server/__tests__/auth.test.ts` — un hash generado con **bcrypt** valida con bcryptjs
      (compatibilidad de los usuarios ya registrados).
- [x] Tests existentes del server adaptados al `openDatabase(driver, path)` inyectado.
- [x] `src/main/__tests__/paths.test.ts` — `unpackedPath`: reescribe dentro del asar, deja intacta una
      ruta normal (dev), y respeta las dos formas de separador.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`)
- [x] Comprobación manual: `npm run dev` + `npm run dev:server` siguen andando; el `.exe` corre
      **fuera del repo** (registro, login, clip con hotkey, reproducción); cerrar y reabrir conserva
      sesión y clips; doble ejecución enfoca la ventana existente.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
