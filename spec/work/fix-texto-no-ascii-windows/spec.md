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
- Reescribir ajustes ya guardados con un nombre corrupto. La app de audio por proceso nunca funcionó
  con ese nombre (OBS ve el exe real); volver a elegirla guarda el bueno. Los juegos manuales sí
  funcionaban y siguen funcionando sin tocar los ajustes: ver «Corrección tras revisión» (B3-1).
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

## Corrección tras revisión (B3-1, B3-2)

Un revisor de regresiones independiente encontró un fallo que introducía este arreglo y un riesgo de
diseño.

**B3-1 (Medium, introducido): los juegos manuales con acentos dados de alta antes dejaban de
detectarse.** El selector de Ajustes → Grabación se llena con `getAudioApps()` (PowerShell), que antes
del arreglo guardaba un `${ProcessName}.exe` corrupto, y el tasklist viejo corrompía el proceso en
marcha **igual** (medido con una copia de PING `pokémonñゲ.exe`: las dos fuentes daban
`pok�mon�?.exe`), así que la comparación exacta de `findRunningGamesMatch` casaba y el juego se
detectaba. Con tasklist ya en UTF-8 el proceso llega con su nombre real y la entrada guardada no vuelve
a casar: sin buffer, sin grabación de sesión automática, carpeta equivocada, sin aviso.
**Causa raíz:** arreglar la lectura de procesos rompió la simetría con datos ya guardados por la otra
lectura rota.

**B3-2 (Low, riesgo de diseño): un tasklist colgado para siempre congelaba la detección.** Con el
listador de un solo sondeo vivo, si tasklist no volvía nunca (antes `execFile` lo mataba a los 10 s y
el siguiente sondeo reintentaba) la detección quedaba congelada hasta reiniciar; en modo automático con
un juego en marcha, `running` no se vaciaba y la grabación de sesión no paraba, llenando el disco.

**Dentro:**
- Comparador compartido (`customExeMatches` / `findCustomGame` en `@shared/games`): una entrada manual
  con `?` o U+FFFD (imposibles en un exe real de Windows: es, sin ambigüedad, una entrada de antes) casa
  con un proceso cuando cada comodín corresponde a exactamente UN carácter no ASCII y el resto es igual
  (ASCII sin mayúsculas, como `exeKey`). Se usa en `findRunningGamesMatch` (exacto primero) y en la
  comprobación de novedad del detector. Los ajustes no se reescriben.
- Válvula de seguridad del listador: con el sondeo vivo 60 s, `taskkill /F /T /PID <cmd>`; el sondeo
  sigue «en curso» hasta que el `cmd` vuelve; si taskkill falla o se cuelga, se reintenta 60 s después.

**Fuera (explícito):**
- Letras fuera de la codepage OEM que el «best fit» de Windows pasaba a ASCII (`ź` → `z`, `ł` → `l`):
  medido, `wiedźmin-łódź.exe` se veía como `wiedzmin-l�dz.exe`. Esas posiciones no son comodines y no
  se pueden distinguir de una letra ASCII legítima; un juego manual así hay que volver a elegirlo en
  Ajustes (el selector ya muestra el nombre real).
- El selector de Grabación sigue comparando exacto: el proceso real aparece como disponible aunque
  haya una entrada corrupta del mismo juego; añadirlo crea una entrada buena que gana a la corrupta.

**Criterios de aceptación:**
- [ ] Una entrada `pok�mon�?.exe` (con nombre «Pokémon») detecta al proceso real `pokémonñゲ.exe`
      con ese nombre, sin pedir re-índice; sin nombre propio se llama como antes del arreglo.
- [ ] No casa con un nombre ASCII de la misma longitud ni con otro número de caracteres no ASCII; las
      entradas exactas no cambian y ganan a una corrupta.
- [ ] Un tasklist que no vuelve: a los 60 s se mata el árbol de su `cmd` (un aviso por intento), nunca
      hay dos sondeos ni dos taskkill a la vez, y la detección se recupera; si taskkill falla, se
      reintenta 60 s después.
- [ ] Suite verde.
