# Tasks — Estructura de carpetas por juego y nomenclatura de archivos

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. `src/shared/clip-naming.ts`: base del nombre (ejecutable sin `.exe` o `Desktop`), marca de
      tiempo `AAAA.MM.DD - HH.MM.SS.CC`, nombre completo (con `Screenshot` en las capturas) y
      segmentos de carpeta.
- [x] 2. `src/main/capture/relocate.ts`: ruta destino + `rename` best-effort con desambiguación
      (` (2)`) y fallback a la ruta original si no se puede mover.
- [x] 3. `CaptureManager.finishSavedClip`: nombres de pista + reubicación; `clip-saved` y
      `lastClipPath` emiten ya la ruta definitiva. `sessionGameExe` recuerda el juego de la sesión
      en curso (al cambiar de juego, el clip que cierra es del anterior).
- [x] 4. Capturas de pantalla: `<salida>/<Juego|Desktop>/Capturas/<Nombre> Screenshot <marca>.png`;
      el ejecutable activo se lo pasan el handler IPC y la hotkey.
- [x] 5. `LibraryManager.reconcile` recursivo (los clips ya viven en subcarpetas).
- [x] 6. `migrate-layout.ts` + `ClipsRepository.setPath`: al arrancar, lo que está suelto en la raíz
      se mueve a la carpeta de su juego (o `Desktop`) con el nombre nuevo y el catálogo se actualiza;
      las capturas del viejo `Capturas/` van a `Desktop/Capturas/`.

## Tests unitarios (obligatorios)

- [x] `clip-naming.test.ts` — base con y sin juego, caracteres inválidos, marca de tiempo con
      centésimas, `Screenshot` intercalado, segmentos de carpeta.
- [x] `relocate.test.ts` — mueve y crea la carpeta; no pisa un archivo existente (` (2)`); si no se
      puede mover devuelve la ruta original.
- [x] `capture-manager.test.ts` — el clip termina en la carpeta del juego (y el `status` apunta al
      archivo definitivo); sin juego va a `Desktop`; el replay usa el juego activo; al cambiar de
      juego el clip que cierra va a la carpeta del juego **viejo**; fallo de movimiento → ruta original.
- [x] `screenshots.test.ts` — la captura va a `Capturas/` del juego, con `Screenshot` en el nombre.
- [x] `library-manager.test.ts` — el reconcile indexa los clips de las subcarpetas y no toma las
      capturas como video.
- [x] `migrate-layout.test.ts` — mueve y renombra usando `createdAt`; sin juego → `Desktop`; no toca
      lo que ya está en subcarpetas; mueve las capturas viejas; un archivo ausente no rompe nada.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 335
- [x] Comprobación manual: migración corrida sobre **copias** de la carpeta y la DB reales del
      owner → los dos clips sueltos quedan en `Desktop/Desktop 2026.07.11 - 18.20.53.46.mp4` y
      `Desktop/Desktop 2026.07.11 - 19.14.57.64.mp4`, con el catálogo apuntando a las rutas nuevas y
      conservando ids y miniaturas. Los originales no se tocaron.
- [ ] Pendiente: verlo en la app real (grabar con juego detectado y tomar una captura).

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
