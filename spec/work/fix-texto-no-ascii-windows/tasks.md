# Tasks — Acentos, ñ, CJK y comillas tipográficas rompían procesos, títulos y «Copiar» en Windows

## Tests unitarios (obligatorios; primero, en rojo)

- [x] D5-BUG-5: `foregroundWindowArgs` fija `OutputEncoding` UTF-8 antes de cualquier `Write-Output`.
- [x] D4-BUG-2: `audioAppsArgs` = `OutputEncoding` UTF-8 + el pipeline de antes intacto;
      `parseAudioApps` conserva acentos/ñ/CJK/’ y tolera un BOM inicial.
- [x] D4-BUG-3: `tasklistCommand` = `cmd /d /s /c "chcp 65001>nul & tasklist /fo csv /nh"`;
      `parseTasklistCsv` con CRLF y nombres no ASCII; un juego manual no ASCII se detecta.
- [x] Regresión del propio envoltorio: el listador rechaza a los 10 s y no lanza un segundo proceso
      mientras el anterior siga vivo; un error o un fallo síncrono no lo dejan «en curso».
- [x] D4-BUG-4: `setClipboardFileCommand` no mete la ruta en el script; la pasa en
      `GAMECLIP_CLIP_PATH` sin tocar el entorno de la app.
- [x] Windows real (`skipIf` fuera de Windows, ~0,5 s): el listador real devuelve los procesos.

## Implementación

- [x] 1. `foreground.ts`: `OutputEncoding` UTF-8 + `foregroundWindowArgs`.
- [x] 2. `audio-apps.ts`: `OutputEncoding` UTF-8 + `audioAppsArgs` + `trim()` en el parseo.
- [x] 3. `game-detector.ts`: `tasklistCommand`, `parseTasklistCsv` y `createTasklistLister`.
- [x] 4. `export/clipboard.ts`: `setClipboardFileCommand` + `copyFileToClipboard`; `ipc.ts` la importa.

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes (85 archivos, 1074 tests)
- [x] Comprobación real (2026-10-09), módulos reales vía tsx:
      - primer plano: sonda «Pokémon mañana ゲーム Marvel’s» intacta (antes «Pok�mon ma�ana ??? Marvel's»),
        sin BOM; `getForegroundWindowTitle()` devuelve el título real.
      - apps: ventana real de `pokémonñ.exe` con ese título → intacta (antes `pok�mon�.exe`).
      - tasklist: `pingñé.exe` y `ゲーム.exe` intactos (antes `ping��.exe` / `???.exe`); nombres ASCII
        idénticos en 3 instantáneas simultáneas; ~500 frente a ~470 ms.
      - envoltorio con un sustituto colgado y timeout de 1 s: `execFile` con timeout llegó a 5 nietos
        vivos en 6 s; `createTasklistLister`, a 1.
      - «Copiar» con ``Marvel’s Spider-Man 2\clip ‘final’ ‚x‛ it's $(…) `n [1] ñ ゲーム.mp4``: antes
        ParserError; ahora `true` y `Get-Clipboard -Format FileDropList` devuelve esa ruta exacta.

## Corrección tras revisión (B3-1, B3-2)

### Tests (primero, en rojo)

- [x] B3-1: una entrada `pok�mon�?.exe` (nombre «Pokémon») detecta al proceso real `pokémonñゲ.exe` con
      ese nombre; `resolveGameName` e `isManualGame` siguen dando el nombre del owner; sin nombre
      propio, se llama como antes del arreglo; ASCII sin mayúsculas.
- [x] B3-1: no casa con un ASCII de la misma longitud, con un no ASCII de más o de menos, con una letra
      ASCII distinta; las entradas exactas no cambian y ganan a una corrupta; `pokemon.exe` no casa con
      `pokémon.exe`; un comodín vale por un solo punto de código (también fuera del BMP).
- [x] B3-1: el detector no pide re-índice por un juego manual guardado corrupto y lo emite.
- [x] B3-2: un sondeo que no vuelve → a los 60 s (no antes) se mata el árbol por el pid del `cmd`, con
      un aviso por intento; ningún segundo sondeo mientras tanto; cuando el `cmd` vuelve, se sondea de
      nuevo y no hay más válvulas ni temporizadores.
- [x] B3-2: taskkill falla → reintento 60 s después; un taskkill que no responde no lanza otro; un
      sondeo que responde antes de 60 s no arma nada; un `cmd` que ya salió no se mata por pid y libera
      el sondeo, sin que su callback tardío libere al siguiente.

### Implementación

- [x] 1. `customExeMatches` + `findCustomGame` en `src/shared/games.ts`; `findRunningGamesMatch` con
      exacto primero y entradas corruptas precalculadas.
- [x] 2. `esReconocido` del detector con `findCustomGame`.
- [x] 3. `createTasklistLister({ run, killTree, timeoutMs, valveMs })` con la válvula `taskkill /F /T`.

### Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes (85 archivos, 1087 tests)
- [x] Comprobación real (2026-10-09):
      - B3-1: con `pokémonñゲ.exe` en marcha, el PowerShell viejo daba `pok�mon�?.exe` (lo que se
        guardaba) y el tasklist viejo lo mismo; el nuevo da el nombre real, la comparación exacta ya no
        casa y `findRunningGamesMatch` con la entrada corrupta devuelve «Pokémon (manual)» con el exe
        real. Un `GameDetector` real lo emitió sin ningún `unknown-executable`.
      - B3-2: sustituto colgado tras el mismo `cmd` (timeout 1 s, válvula 3 s, taskkill real): rechazo
        a 1 s, «en curso» después, aviso y taskkill a 3,0 s, callback del `cmd` a 3,1 s, siguiente sondeo
        con el tasklist real a 4,4 s (486 procesos), 0 colgados vivos.
      - Residual: `wiedźmin-łódź.exe` se veía antes como `wiedzmin-l�dz.exe` (best fit a ASCII): fuera
        de alcance.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
- [ ] Notas de la versión: los juegos manuales con acentos, ñ o caracteres japoneses/chinos/coreanos
      dados de alta antes siguen detectándose; si alguno con letras de Europa central (ł, ź, č…) dejara
      de detectarse, basta volver a elegirlo en Ajustes → Grabación.
