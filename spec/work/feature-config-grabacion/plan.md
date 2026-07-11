# Plan — Configuración de grabación + grabación de escritorio

> **Este plan es un contrato.** *Aprobación delegada al agente en esta sesión.*

## Enfoque

Fundación inline (modelo + contratos IPC + stubs) → dos agentes en paralelo con fronteras de
archivos disjuntas (A: main · C: renderer) → revisión del diff por el agente principal →
gates → selftest E2E real.

### Modelo (`src/shared/capture.ts` + `games.ts`)

```
recordingMode: 'manual' | 'auto' | 'off'      // default 'manual'
gameSwitchEnabled: boolean                     // default true
gameSwitchHotkey: string                       // default 'F10' (acelerador de Electron)
autoGameSwitching: boolean                     // default true (~20 s de foco)
screenshotsEnabled: boolean                    // default true
screenshotHotkey: string                       // default 'F6'
customGames: string[]                          // exes añadidos a mano (máx 50, sin duplicados)
screenMonitorIndex: number                     // monitor a grabar (0 = primario)
desktopAutoSwitchToGame: boolean               // default true (game capture apilado)
```

`games.ts`: `findRunningGamesMatch(processNames, customExes)` devuelve TODOS los juegos
conocidos en ejecución (curados + manuales; nombre del manual = exe sin extensión).

### IPC nuevo

- `capture:get-displays` → `DisplayInfo[]` (`{ index, label, width, height, primary,
  thumbnailDataUrl }`) vía `screen.getAllDisplays()` + `desktopCapturer` (thumbnail ~320px).
- `capture:switch-game` → rotar juego activo (para el botón de la UI; el hotkey global vive
  en el main).
- `capture:take-screenshot` → guardar PNG (para pruebas/UI; el hotkey global vive en el main).

### Main (Agente A — opus)

- `game-detector.ts`: rastrear el CONJUNTO de juegos en ejecución (`running: RunningGameMatch[]`),
  emitir `games-changed(list)` además de los eventos actuales (compat), aceptar
  `customGames` actualizables (`setCustomGames`).
- `manager.ts`: `setRunningGames(list)` reemplaza a `setGameDetected` como fuente (mantener
  compat interna); juego activo + `switchGame()` (rota, re-liga audio, y en modo `auto` corta
  y arranca grabación); modo `auto` (game start/stop → start/stopRecording); modo `off`
  (shouldBuffer false, startRecording/saveReplay no-op); `recordingMode` en los guards.
- `auto-switcher.ts` (nuevo): poll del título en primer plano (reutiliza
  `getForegroundWindowTitle`) contra los juegos en ejecución; 4 sondeos (20 s) consecutivos
  con otro juego → `manager.switchGame(target)`.
- `screenshots.ts` (nuevo): capturar el monitor configurado con `desktopCapturer` a PNG en
  `<outputDir>/Capturas/captura AAAA-MM-DD hh-mm-ss.png`; toast del overlay al guardar.
- `obs.ts`: `monitor_capture` con `monitor: screenMonitorIndex`; tamaño base = display
  elegido (el env gana `displayByIndex(index)` inyectable); `desktopAutoSwitchToGame=false`
  → no crear la fuente game_capture.
- `ipc.ts`/`index.ts`: handlers nuevos, hotkeys globales de switch/screenshot registrados
  junto al de replay, wiring del auto-switcher.

### Renderer (Agente C — sonnet)

- `views/ajustes/Grabacion.tsx` (nueva, primera del sub-nav): radios de modo, bloque de
  cambio de juego, bloque de capturas, bloque de detección (alta manual con dropdown de
  procesos vía `getAudioApps()` + texto libre; lista con basurero), bloque de grabación de
  escritorio (botón modal + selector + toggle).
- `components/DisplayPicker.tsx` (nuevo): modal con grid de displays (thumbnail, nombre,
  “(principal)”), Cerrar / Empezar a grabar.
- Rutas + `AjustesLayout` + estilos + tests (mocks nuevos en setup.ts).

## Archivos / módulos afectados

Fundación: `src/shared/capture.ts` · `src/shared/games.ts` · `src/shared/ipc.ts` ·
`src/preload/index.ts` · `src/main/ipc.ts` (stubs) · `src/main/index.ts` (wiring).
Agente A: `src/main/capture/{game-detector,manager,obs,auto-switcher,screenshots}.ts` + tests.
Agente C: `src/renderer/views/ajustes/*`, `components/DisplayPicker.tsx`, `App.tsx`,
`styles.css`, tests renderer.

## Decisiones y alternativas consideradas

- **Hotkeys de switch/screenshot con `globalShortcut`** (como el de replay) y no con el hook
  de uiohook: son de pulsación simple, no necesitan keyup.
- **Auto-switch por título de ventana** y no por PID en primer plano — obtener el proceso de
  la ventana activa exigiría otro round-trip PowerShell por sondeo; el título ya se obtiene y
  suele contener el nombre del juego. Best-effort documentado.
- **`desktopCapturer` para screenshots y previews** — sin dependencias nuevas; libobs no
  expone snapshot simple por osn.
- **Índice de monitor** para `monitor_capture` — osn no expone enumeración de monitores
  tipada; el índice funciona en configuraciones normales (riesgo documentado en el spec).
- **Modo `off` conserva libobs inicializado** (pipeline construido pero sin buffer) — evita
  otro camino de init/teardown; solo se bloquean las salidas.

## Riesgos

- Orden de displays Electron vs índice de monitor de libobs; verificado manualmente con los
  2 monitores de esta máquina en el selftest.
- `desktopCapturer` no ve fullscreen exclusivo (screenshot puede salir negro en ese caso).
- El matching por título del auto-switch puede no reconocer títulos que no contengan el
  nombre del juego (best-effort explícito).

---

**Estado:** ✅ aprobado el 2026-07-11 (aprobación delegada)
