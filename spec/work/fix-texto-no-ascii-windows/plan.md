# Plan — Acentos, ñ, CJK y comillas tipográficas rompían procesos, títulos y «Copiar» en Windows

> **Este plan es un contrato.** Aprobado con el resto de la tanda D.

## Enfoque

1. **Salida UTF-8 en PowerShell** (`library/foreground.ts`, `capture/audio-apps.ts`): primera línea del
   script `[Console]::OutputEncoding = [Text.Encoding]::UTF8`, igual que `games/powershell.ts`.
   `encoding: 'utf8'` explícito en `execFile` (ya era el valor por defecto). Los args salen de
   builders puros (`foregroundWindowArgs`, `audioAppsArgs`) para testearlos.
2. **tasklist en UTF-8** (`capture/game-detector.ts`): `tasklistCommand()` →
   `cmd.exe /d /s /c "chcp 65001>nul & tasklist /fo csv /nh"`. `/d` evita el AutoRun del registro;
   `>nul` saca el mensaje de chcp de stdout; `&` (no `&&`) hace que, si chcp fallara, tasklist corra
   igual con la codepage de antes. El exit code de `cmd /c` es el de tasklist. El parseo pasa a
   `parseTasklistCsv` sin cambios.
3. **Sin tasklist huérfanos** (`createTasklistLister`): al vencer el timeout de `execFile` Node mata
   el `cmd`, pero tasklist es su hijo y sigue vivo (medido). tasklist consulta WMI (`Win32_Process`);
   con WMI colgado cada sondeo dejaría uno más (medido con un sustituto colgado: 5 vivos a la vez en
   6 s). El listador rechaza a los 10 s igual que antes (el detector conserva su estado), pero no
   mata el `cmd` y, mientras el anterior siga vivo, los sondeos fallan sin lanzar otro: nunca hay más
   de uno. Un `execFile` que lanza en síncrono también libera el «en curso». Cada detector tiene su
   propio listador.
4. **«Copiar» sin interpolar** (`export/clipboard.ts`): `Set-Clipboard -LiteralPath
   $env:GAMECLIP_CLIP_PATH` con `env: { ...process.env, GAMECLIP_CLIP_PATH: ruta }`. La variable solo
   existe en el hijo. `ipc.ts` importa `copyFileToClipboard` del módulo nuevo.
5. `parseAudioApps` hace `trim()` antes de `JSON.parse` (un BOM inicial vaciaría el selector).

## Archivos / módulos afectados

- `src/main/library/foreground.ts` (+ `src/main/__tests__/foreground.test.ts`, nuevo)
- `src/main/capture/audio-apps.ts` (+ `src/main/__tests__/audio-apps.test.ts`)
- `src/main/capture/game-detector.ts` (+ `src/main/__tests__/game-detector.test.ts`)
- `src/main/export/clipboard.ts` (nuevo) y `src/main/ipc.ts` (+ `src/main/__tests__/clipboard.test.ts`)

## Decisiones y alternativas consideradas

- **`chcp 65001` en un `cmd` envoltorio** frente a decodificar la salida OEM en Node: tasklist ya
  convierte lo que no cabe en la codepage OEM a `?` (CJK), así que decodificar no lo recupera; y
  WHATWG `TextDecoder` no trae cp850/cp437. Frente a PowerShell `Get-Process`: el sondeo cada 5 s
  usa tasklist precisamente para no arrancar PowerShell.
- **La consola del `cmd` es propia**: con `windowsHide` Node crea el hijo con `CREATE_NO_WINDOW`, que
  le da una consola nueva sin ventana. Medido: el chcp del hijo no cambia la consola del padre.
- **`&` frente a `&&`:** con `&&`, un chcp fallido dejaría el sondeo en error permanente; con `&`
  vuelve al comportamiento de antes (lista completa con acentos rotos). Medido con `chcp 99999`.
- **No matar el `cmd` al vencer el timeout** frente a matarlo (lo que hace `execFile` con `timeout`)
  o usar `taskkill /T`: matarlo deja a tasklist huérfano, y taskkill también usa WMI (`Win32_Process`),
  así que se colgaría igual. Esperar al anterior acota los procesos a uno, como antes.
- **Variable de entorno** frente a escapar más comillas: no hay ninguna lista de comillas que escapar
  si la ruta no entra al parser.
- **Sin guardia de «lista vacía = error»** en tasklist: con `&`, un chcp fallido no produce una lista
  vacía; el detector mantiene su semántica (error → estado intacto; vacía → anti-parpadeo).

## Riesgos

- Coste: medido +35 a +60 ms por sondeo cada 5 s (unos 500 frente a 470 ms).
- Cada instantánea de procesos incluye ahora el `cmd.exe` del envoltorio, como ya incluía
  `tasklist.exe`: entra en la línea base desde el primer sondeo y no dispara el re-índice por novedad.
- Un tasklist colgado congela la detección hasta que la válvula (ver «Corrección tras revisión») mata
  su árbol a los 60 s. Si la app se cierra antes, ese único tasklist puede sobrevivirla hasta que WMI
  responda (el job de libuv no incluye nietos).
- PowerShell no escribe BOM con `OutputEncoding = UTF8` (medido); aun así `foreground` ya hacía
  `trim()` y `parseAudioApps` ahora también.

## Corrección tras revisión (B3-1, B3-2)

### Enfoque

1. **B3-1 — `customExeMatches` y `findCustomGame` en `src/shared/games.ts`.** Igualdad exacta o, solo
   si la clave guardada contiene `?` o U+FFFD, comparación posición a posición por puntos de código:
   cada comodín exige exactamente UN carácter no ASCII del proceso (`codePointAt > 0x7f`) y el resto
   tiene que ser igual (las dos claves vienen en minúsculas de `exeKey`). `findRunningGamesMatch` busca
   primero exacto y solo después entre las entradas corruptas, que precalcula una vez por llamada (casi
   siempre ninguna: el sondeo no paga nada). `findCustomGame` (exacto primero) sustituye a la
   comparación exacta en `esReconocido` del detector. El nombre sigue saliendo de la entrada guardada
   (`resolveGameName(manual.executable)`): el nombre propio del owner o, sin él, el mismo que antes del
   arreglo, así que los clips van a la misma carpeta. `RunningGameMatch.executable` es el exe real,
   que es lo que necesita OBS para apuntar la captura y el audio del juego.
2. **B3-2 — válvula en `createTasklistLister`.** `RunCommand` devuelve el proceso lanzado
   (`ProcesoLanzado`: `pid`, `exitCode`, `signalCode`; un `ChildProcess` vale) y el matador de árboles
   es inyectable (`KillTree`, por defecto `taskkill /F /T /PID` con `execFile` y timeout de 10 s: es
   hijo directo, así que ese timeout sí lo mata). Con el sondeo vivo `valveMs` (60 s): un
   `console.warn` por intento y `taskkill` sobre el pid del `cmd`; el sondeo sigue «en curso» hasta que
   el callback del `cmd` llega de verdad. Si el `cmd` sigue sin volver, otro intento `valveMs` después de
   que responda ese taskkill (nunca dos a la vez). Las opciones pasan a un objeto
   (`{ run, killTree, timeoutMs, valveMs }`).

### Decisiones

- **Comodín solo con `?`/U+FFFD:** son imposibles en un exe real, así que una entrada sin ellos nunca se
  compara de forma aproximada (`pokemon.exe` no casa con `pokémon.exe`). Las letras que el «best fit»
  pasaba a ASCII quedan fuera: no se pueden distinguir de una letra ASCII legítima.
- **Sin reescribir los ajustes:** la entrada se deja como la guardó el owner; el comparador la entiende.
- **Estado por sondeo (`terminado`) e idempotente:** un callback tardío de un sondeo ya liberado no
  puede liberar al siguiente (si no, habría dos tasklist a la vez).
- **No matar por pid un `cmd` que ya salió:** Windows no reutiliza un pid mientras haya un handle
  abierto, y libuv lo mantiene hasta procesar la salida; pasada esa salida el pid podría ser de otro
  proceso. Si el `cmd` ya salió pero algo ajeno retiene su salida, la válvula avisa y libera el sondeo
  en vez de matar.
- **El reintento cuenta desde que responde el taskkill**, no desde que se lanzó: así nunca hay dos a la
  vez aunque uno tarde.
- **Tercera revisión (2.1):** la llamada a `killTree` va en `try/catch` (spawn lanza en síncrono ante
  ENOMEM y similares): un aviso de una línea y el mismo rearme que ante un error, como mucho uno por
  intento.

### Riesgos

- Con WMI colgado del todo, taskkill (que también usa WMI) tampoco puede: un taskkill cada ~70 s,
  cada uno muerto por su timeout de 10 s; nada se acumula y la detección vuelve cuando WMI responde.
- Si se vuelve a añadir el juego desde el selector, conviven la entrada corrupta y la buena; gana la
  exacta.

---

**Estado:** ✅ aprobado el 2026-10-09
