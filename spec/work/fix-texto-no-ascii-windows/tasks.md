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

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
