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
- Con WMI colgado de forma permanente la detección queda congelada hasta que tasklist responda (antes,
  igual: todos los sondeos vencían). Si la app se cierra en ese momento, ese único tasklist puede
  sobrevivirla hasta que WMI responda (el job de libuv no incluye nietos).
- PowerShell no escribe BOM con `OutputEncoding = UTF8` (medido); aun así `foreground` ya hacía
  `trim()` y `parseAudioApps` ahora también.

---

**Estado:** ✅ aprobado el 2026-10-09
