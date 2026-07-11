# Plan — Pulido de paridad (Fase 6)

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Cuatro piezas que se apoyan en la arquitectura existente (dominio compartido puro → manager
en main → contrato IPC → preload → UI):

1. **Detección de juegos.** Dominio puro en `src/shared/games.ts`: lista curada
   `KNOWN_GAME_PROCESSES` (nombre de proceso en minúsculas → nombre para mostrar) y
   `findRunningGame(nombres)` (normaliza `.exe`/mayúsculas). En main,
   `GameDetector` (EventEmitter) sondea cada 5 s con `tasklist /fo csv /nh` (más liviano
   que arrancar PowerShell) e inyecta el listador por constructor para testear con fakes.
   Anti-parpadeo: el juego se da por cerrado tras **2 sondeos** consecutivos sin verlo.

2. **Auto-inicio del buffer.** `CaptureSettings` gana `bufferMode: 'always' | 'game'`.
   `CaptureManager` recibe el backend obs **inyectable** (interfaz `CaptureBackend`,
   default `new ObsCapture()`) para poder testear las transiciones sin libobs. Nuevo
   `setGameDetected(nombre | null)`: actualiza `CaptureStatus.detectedGame` y, en modo
   `'game'`, arranca el buffer (`idle → buffering`) o lo detiene (`buffering → idle`),
   sin tocar jamás el estado `recording`. `initialize()`/reconstrucción solo arrancan el
   buffer si `bufferMode === 'always'` o hay juego detectado. El evento `clip-saved`
   incluye el juego detectado y `LibraryManager.registerSavedClip` acepta un `gameHint`
   con prioridad sobre el título de la ventana en primer plano.

3. **Overlay.** Segunda página del renderer (`src/renderer/overlay.html` + entrada React
   mínima) construida con entradas múltiples de rollup en `electron.vite.config.ts`.
   En main, `OverlayController` posee una `BrowserWindow` transparente, frameless,
   `alwaysOnTop('screen-saver')`, `skipTaskbar`, no enfocable y click-through
   (`setIgnoreMouseEvents(true)`), anclada a la esquina superior derecha del área de
   trabajo. Estado empujado por el evento IPC `OverlayState` (`{ recording, toast }`);
   el toast lo temporiza el main (3 s) y la ventana **solo es visible** cuando hay algo
   que mostrar (`enabled && (recording || toast)`).

4. **Bandeja + auto-arranque.** `src/main/tray.ts` crea el `Tray` con icono PNG embebido
   en base64 (generado una vez; variante roja mientras se graba) y menú
   Abrir/Guardar clip/Salir. En `index.ts`: `close` de la ventana la oculta salvo que la
   app esté saliendo (`before-quit`), `--hidden` arranca sin mostrar la ventana, y
   `applyAutoLaunch()` llama a `app.setLoginItemSettings({ openAtLogin, args: ['--hidden'] })`
   solo si `app.isPackaged`.

## Archivos / módulos afectados

- `src/shared/capture.ts` — `bufferMode`, `overlayEnabled`, `autoLaunch` en settings +
  normalización; `detectedGame` en `CaptureStatus`.
- `src/shared/games.ts` *(nuevo)* — lista curada + `findRunningGame`.
- `src/shared/ipc.ts` — evento `OverlayState`, tipo `OverlayState`, API `overlay` en
  `GameclipApi`.
- `src/main/capture/game-detector.ts` *(nuevo)* — sondeo de procesos con debounce.
- `src/main/capture/manager.ts` — backend inyectable, `setGameDetected`, buffer según modo,
  `clip-saved` con juego.
- `src/main/library/manager.ts` — `gameHint` en `registerSavedClip`.
- `src/main/overlay.ts` *(nuevo)* — `OverlayController` (ventana + estado + toast).
- `src/main/tray.ts` *(nuevo)* — bandeja con icono embebido y menú.
- `src/main/index.ts` — cableado de detector/overlay/tray, close-to-tray, `--hidden`,
  auto-arranque.
- `src/preload/index.ts` — namespace `overlay.onState`.
- `src/renderer/overlay.html`, `src/renderer/overlay/main.tsx`,
  `src/renderer/overlay/Overlay.tsx` *(nuevos)* — página del overlay.
- `electron.vite.config.ts` — entradas múltiples del renderer.
- `src/renderer/components/CaptureBar.tsx` — chip con el juego detectado.
- `src/renderer/views/Ajustes.tsx` — fieldset «Comportamiento» (3 ajustes nuevos).
- `src/renderer/styles.css` — estilos del overlay y del chip.
- Tests: `shared/__tests__/games.test.ts`, `shared/__tests__/capture.test.ts`,
  `main/__tests__/game-detector.test.ts`, `main/__tests__/capture-manager.test.ts` (nuevo),
  `main/__tests__/library-manager.test.ts`, `renderer/__tests__/overlay.test.tsx`,
  `capture-ui.test.tsx`, `setup.ts` (mock `overlay` + status con `detectedGame`).

## Decisiones y alternativas consideradas

- **`tasklist` en vez de PowerShell para sondear procesos** — arrancar PowerShell cada 5 s
  cuesta ~0,5–1 s de CPU por sondeo; `tasklist /fo csv /nh` es un exe liviano y su CSV es
  trivial de parsear.
- **Lista curada de procesos en vez de heurísticas** — una heurística (ventana fullscreen,
  uso de GPU) da falsos positivos difíciles de depurar; la lista es predecible, testeable
  y ampliable. las apps de clips usa una DB de juegos: queda explícitamente fuera.
- **Overlay como BrowserWindow transparente, no inyección** — la inyección al proceso del
  juego (estilo Discord/Steam) exige un hook nativo por API gráfica y firma de código;
  fuera de alcance. La ventana encima cubre borderless/ventana, que es el modo dominante.
- **Ventana del overlay oculta cuando no hay nada que mostrar** — evita coste de composición
  permanente y cualquier interferencia con juegos.
- **Toast temporizado en main** — un solo dueño del estado; el renderer del overlay queda
  tonto y trivial de testear.
- **`bufferMode` default `'always'`** — preserva el comportamiento de las Fases 3–5; el
  modo `'game'` es opt-in.
- **Backend de captura inyectable** — alternativa: mockear el módulo `obs.ts` con
  `vi.mock`; la inyección es más explícita y no acopla los tests al grafo de módulos.
- **Icono de bandeja embebido en base64** — evita gestionar assets/rutas en dev vs build
  para dos PNG de 16×16.

## Riesgos

- El overlay no se ve sobre fullscreen exclusivo (limitación documentada en el spec).
- `transparent: true` + `alwaysOnTop` tiene fama de esquinas raras en Windows (p. ej. al
  cambiar DPI); mitigado porque la ventana es diminuta, sin foco y casi siempre oculta.
- Falsos negativos de la lista curada (juego no listado → no auto-arranca el buffer); el
  modo `'always'` sigue disponible y es el default.
- `setLoginItemSettings` en dev registraría `electron.exe`: guardado con `app.isPackaged`.

---

**Estado:** ✅ aprobado el 2026-07-11 (aprobación delegada por el owner para esta sesión)
