# Spec — Acentos, ñ, CJK y comillas tipográficas rompían procesos, títulos y «Copiar» en Windows

**Tipo:** Fix
**Rama:** `fix/texto-no-ascii-windows`
**Fecha:** 2026-10-09

## Problema / Objetivo

Auditoría bug-hunter D: D5-BUG-5, D4-BUG-2, D4-BUG-3 y D4-BUG-4 (Low). Cuatro sitios del main que
hablan con procesos de Windows perdían el texto no ASCII. Todo medido en la máquina del owner (Windows
en español, codepage OEM de consola 850).

1. **D5-BUG-5 — título de la ventana en primer plano** (`library/foreground.ts`). «Pokémon» llegaba
   con la é convertida en U+FFFD, así que el auto-cambio de juego (`capture/auto-switcher.ts`, que
   busca el nombre del juego en ese título) no reconocía a los juegos con acentos.
   **Causa raíz:** el script de PowerShell no fuerza su salida a UTF-8: escribe en la codepage OEM de
   su consola y Node decodifica UTF-8. `games/powershell.ts` ya documentaba y resolvía este mismo
   problema con `[Console]::OutputEncoding = [Text.Encoding]::UTF8`; este script no lo hacía.
2. **D4-BUG-2 — selectores de apps** (`capture/audio-apps.ts`, `Get-Process … ConvertTo-Json`), en
   Ajustes → Audio/Grabación. Misma causa raíz. Medido con una ventana real: el proceso
   `pokémonñ.exe` con título «Pokémon mañana ゲーム Marvel’s» llegaba como `pok�mon�.exe` /
   «Pok�mon ma�ana ??? Marvel's». Un exe no ASCII se guardaba con el nombre roto.
3. **D4-BUG-3 — detección de juegos** (`capture/game-detector.ts`, `tasklist /fo csv /nh`). tasklist
   escribe en la codepage OEM de la consola: `pingñé.exe` llegaba como `ping��.exe` y `ゲーム.exe` como
   `???.exe` (medido), así que un juego con un ejecutable no ASCII nunca se detectaba.
   **Causa raíz:** tasklist no tiene salida Unicode; la codepage hay que cambiarla en su propia
   consola antes de que escriba.
4. **D4-BUG-4 — «Copiar» el último export** (`ipc.ts` → `copyFileToClipboard`). Armaba
   `Set-Clipboard -LiteralPath '<ruta>'` escapando solo la `'` ASCII.
   **Causa raíz:** PowerShell también trata ‘ ’ ‚ ‛ como comillas simples. Con «Marvel’s…» en la ruta
   la cadena se cerraba antes de tiempo: ParserError «Falta la cadena en el terminador» (medido) y
   «Copiar» fallaba.

## Alcance

**Dentro:**
- `foreground.ts` y `audio-apps.ts`: `[Console]::OutputEncoding = [Text.Encoding]::UTF8` al principio
  del script, como en `games/powershell.ts`.
- `game-detector.ts`: tasklist dentro de `cmd.exe /d /s /c "chcp 65001>nul & tasklist /fo csv /nh"`.
  Además, el sondeo no lanza otro tasklist mientras el anterior siga vivo (ver plan: sin esto, el
  propio envoltorio podía dejar tasklist huérfanos al vencer el timeout).
- «Copiar»: la ruta viaja en una variable de entorno del proceso hijo, nunca dentro del script.
  `copyFileToClipboard` pasa de `ipc.ts` a `export/clipboard.ts` para poder testearla sin Electron.
- `parseAudioApps` tolera un BOM o espacios alrededor del JSON.
- Tests de regresión.

**Fuera (explícito):**
- Migrar ajustes ya guardados con un nombre corrupto (app de audio por proceso o juego manual elegidos
  en el selector antes del arreglo): nunca funcionaron; volver a elegirlos guarda el nombre bueno.
- `elevated-launch.ts` (`powershellElevatedArgs`, `powershellRelaunchElevatedArgs`) interpola la ruta
  del portable entre comillas simples escapando solo la `'` ASCII: una ruta con ’ tendría el mismo
  ParserError. Es otro flujo (tarea elevada / relanzar como admin); va en su propio fix.
- `games/exe-metadata.ts` rechaza (a propósito, por seguridad) nombres de proceso no ASCII: para esos
  exe no hay sugerencia de nombre al dar de alta un juego a mano. Limitación previa, no un fallo.

## Criterios de aceptación

- [ ] El script de primer plano devuelve «Pokémon mañana ゲーム Marvel’s» intacto (sonda real) y el
      título real sigue llegando.
- [ ] El selector de apps lista `pokémonñ.exe` con su título intacto (ventana real).
- [ ] El sondeo de procesos devuelve `pingñé.exe` y `ゲーム.exe` intactos (procesos reales), con los
      nombres ASCII idénticos a los de antes y un coste extra de unos 35-60 ms por sondeo.
- [ ] Si chcp fallara, tasklist corre igual (lista completa, no vacía); un fallo de tasklist sigue
      siendo un error del sondeo; un tasklist colgado no deja procesos acumulados.
- [ ] «Copiar» funciona con una ruta con ’ ‘ ‚ ‛ ' $() ` [] ñ y CJK, y el portapapeles contiene esa
      ruta exacta.
- [ ] Suite verde.
