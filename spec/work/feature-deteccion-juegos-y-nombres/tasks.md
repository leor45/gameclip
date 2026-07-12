# Tasks — Detección automática de juegos instalados y nombres reales

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. **Test de regresión primero (rojo).** Un juego instalado por launcher, ausente de la lista curada
       y de `customGames`, no se detecta hoy.
- [x] 2. `src/main/games/scan.ts` — escaneo de `.exe` de una carpeta (tope de 4 niveles, carpetas de ruido,
       blacklist de ejecutables auxiliares).
- [x] 3. `src/main/games/sources/steam.ts` — `libraryfolders.vdf` + `appmanifest_*.acf` (UTF-8).
- [x] 4. `src/main/games/sources/epic.ts` — manifiestos `.item`.
- [x] 5. `src/main/games/powershell.ts` + `sources/gog.ts` + `sources/uninstall-registry.ts` (Ubisoft · EA ·
       Battle.net) + `sources/xbox.ts`. Todas fail-soft: cualquier error → `[]`.
- [x] 6. `src/main/games/index.ts` — orquestador: fuentes → escaneo → mapa `exe → juego`; caché en
       `userData/games-index.json` con huella; build en background al arrancar.
- [x] 7. `src/shared/games.ts` — `resolveGameName()` con la prioridad del plan; `findRunningGamesMatch()`
       acepta índice + `CustomGame[]`; `isManualGame()` adaptado.
- [x] 8. `src/shared/capture.ts` — tipo `CustomGame`, `normalizeCustomGames()` migrando desde `string[]`.
- [x] 9. Enchufar el índice: `game-detector.ts`, `main/index.ts`, `capture/manager.ts`.
- [x] 10. `src/main/games/exe-metadata.ts` + `suggest.ts` + IPC `games:get-index`, `games:rescan` y
       `games:suggest-name` (shared/preload/main).
- [x] 11. `src/renderer/views/ajustes/Grabacion.tsx` — campo "Nombre (opcional)" pre-rellenado, listado
       `Nombre (exe.exe)`, renombrado en sitio, botón "Volver a escanear". `CaptureBar` usa el índice.
- [x] 12. `src/shared/clip-naming.ts` — `clipBaseName()` recibe el nombre resuelto y estrena saneador
       endurecido; `gameFromFolderName()` consulta el índice y los nombres manuales; `relocate.ts` le pasa
       el nombre.
- [x] 13. `src/main/library/manager.ts` — re-etiquetado transaccional de la columna `game` al arrancar
       (idempotente, sin E/S de ficheros) y al cambiar el nombre de un juego.
- [x] 14. **Bug encontrado en la verificación real:** `EpicWebHelper.exe` (dentro de la carpeta de Fortnite,
       pero lo arranca el launcher de Epic) hacía que la app detectara Fortnite siempre. Blacklist de
       helpers/launchers/bootstrappers + descarte de ejecutables ambiguos.

## Tests unitarios (obligatorios)

Camino feliz **y** casos borde. El de regresión (paso 1) fue primero: rojo → verde.

- [x] `findRunningGamesMatch` detecta un juego que solo conoce el índice (**regresión del bug**).
- [x] `GameDetector` detecta el juego en cuanto el índice llega (el índice se construye en background).
- [x] Prioridad de `resolveGameName`: manual > índice > curada > basename.
- [x] Steam: `libraryfolders.vdf` con varias bibliotecas + `.acf` con `™` (UTF-8, sin mojibake); un juego
      catalogado pero no descargado no entra.
- [x] Epic: el proceso real ≠ `LaunchExecutable` (caso Fortnite) — el escaneo lo encuentra igual.
- [x] Fuentes de registro: GOG y desinstalación (acepta editoras de juegos y carpetas de launcher; descarta
      los propios launchers, los redistribuibles y el software que no es un juego).
- [x] Una fuente que peta → `[]`, sin tumbar el índice ni a las demás.
- [x] `scan.ts` descarta ruido (`_CommonRedist`, `UnityCrashHandler64.exe`) y respeta el tope de profundidad.
- [x] **Regresión:** `scan.ts` descarta los helpers del launcher (`EpicWebHelper.exe`), que corren aunque el
      juego esté cerrado.
- [x] Un ejecutable compartido por dos juegos se descarta por ambiguo, no se adjudica al primero.
- [x] `normalizeCustomGames` migra `string[]` viejo a `CustomGame[]` sin perder juegos.
- [x] Juego manual **sin** nombre se comporta como hoy (no regresión).
- [x] `gameFromFolderName('acblackflag')` → nombre real con el índice; sin índice, se comporta como hoy.
- [x] `gameFromFolderName` recupera el nombre EXACTO del catálogo desde la carpeta saneada (o el juego se
      partiría en dos entradas de la biblioteca).
- [x] `clipBaseName`: `Marvel's Spider-Man: Miles Morales` → `Marvel's Spider-Man Miles Morales`.
- [x] `clipBaseName`, casos borde: `™`/`®`, punto o espacio final, espacios dobles, nombre reservado (`CON`),
      nombre larguísimo (tope de 64), nombre que queda vacío al limpiarlo → `Desktop`.
- [x] `targetPathFor` de Arc Raiders → `ARC Raiders/ARC Raiders <marca>.mp4`, no `pioneergame/`.
- [x] Re-etiquetado: viejos y nuevos bajo la misma entrada; idempotente; el nombre manual manda; los clips
      de escritorio siguen sin juego.
- [x] UI: nombre pre-rellenado y guardado; listado `Nombre (exe.exe)`; nombre desde el índice; renombrar en
      sitio; "Volver a escanear".

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 532 tests, 51 ficheros
- [x] **Comprobación manual (app real, máquina del owner):**
      - Índice construido desde los launchers de verdad: 31 juegos, 66 ejecutables (steam 27 · epic 5 ·
        registry 1 · xbox 0 · gog 0).
      - `milesmorales.exe` → `Marvel's Spider-Man: Miles Morales`; `acblackflag.exe` →
        `Assassin's Creed Black Flag Resynced`; `fortniteclient-win64-shipping.exe` → `Fortnite`.
      - Ningún falso positivo: ningún ejecutable del índice corre con los juegos cerrados.
      - Los 12 clips viejos de `acblackflag/` aparecen en la Biblioteca como
        `Assassin's Creed Black Flag Resynced`, **sin moverse del disco**.
      - Juego falso `notepad.exe` con nombre `Prueba: El Juego™` → detectado con ese nombre, y el clip
        guardado en `Prueba El Juego/Prueba El Juego 2026.07.12 - ….mp4` (saneado), catalogado con el
        nombre exacto `Prueba: El Juego™`.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
