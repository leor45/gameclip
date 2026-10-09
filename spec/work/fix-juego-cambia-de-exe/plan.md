# Plan — Si un juego pasa de su lanzador al exe real, la captura no le sigue

> **Este plan es un contrato.** Diseño fijado con el encargo del fix (D4-BUG-1).

## Enfoque

1. `src/main/capture/game-detector.ts`:
   - `keepExecutables(matches, processNames)`: tras `findRunningGamesMatch`, para cada juego ya
     confirmado cuyo exe sigue en la lista de procesos (por `exeKey`, sin distinguir mayúsculas) y
     sigue resolviéndose como ese juego (`findRunningGamesMatch([exe], ctx)`, el mismo criterio del
     matching), se conserva ese exe. El orden de la lista no cambia.
   - `setChanged` compara nombre **y** ejecutable de cada juego.
2. `src/main/capture/manager.ts` (`applyActiveGame`):
   - `exeChanged`: mismo nombre, otro exe (comparado por `exeKey`).
   - El re-apuntado en caliente pasa a dispararse con `changed || exeChanged` (mismas guardas: sin
     rebuild reciente y `builtProfile === 'game'`; el audio, además, con `audioMode === 'apps' &&
     gameAudioEnabled`).
   - Con `exeChanged`, `startAimRetries()` tras re-apuntar el vídeo.
   - `applyAutoRecording` sigue recibiendo `changed` (false): la sesión no se corta.

## Archivos / módulos afectados

- `src/main/capture/game-detector.ts` (+ `src/main/__tests__/game-detector.test.ts`)
- `src/main/capture/manager.ts` (+ `src/main/__tests__/capture-manager.test.ts`)
- `spec/constitution/roadmap.md`

## Decisiones y alternativas consideradas

- **Pegajoso en el detector** y no como parámetro opcional de `findRunningGamesMatch`: la función es
  pura y la usan `findRunningGameMatch`/`findRunningGame` y sus tests; el estado «qué exe tenía
  confirmado» es del detector. Ningún llamador existente cambia.
- **Comprobar que el exe confirmado sigue siendo ese juego**, no solo que siga vivo: tras un re-índice
  o al editar un juego manual, un exe vivo puede pasar a ser otro juego (o ninguno); conservarlo
  dejaría un mismo exe bajo dos nombres.
- **Re-apuntar durante una grabación** (no aplazarlo como un rebuild): `updateGameCaptureTarget` y
  `updateGameAudioTarget` solo hacen `source.update(...)` sobre fuentes existentes; no tocan salidas
  ni encoders. Es lo que ya hacía la rotación de juego con una grabación manual en curso y lo que hace
  el bucle de re-apuntado (que corre también grabando). Aplazarlo dejaría el clip entero apuntando al
  lanzador, que es justo el bug.
- **Rearrancar el bucle de re-apuntado** solo en el cambio de exe: el exe real acaba de aparecer y su
  ventana suele llegar después del proceso (anti-cheat, como `start_protected_game.exe`); el bucle del
  build pudo terminar ya (apuntó a una ventana del lanzador o agotó el tope) y el re-apuntado único
  caería en `any_fullscreen`. Las rotaciones entre juegos ya abiertos no cambian.

## Riesgos

- Una emisión de más del detector por un relevo legítimo de exe: el manager solo re-apunta (sin
  rebuild ni grabación). El pegajoso evita la ráfaga mientras conviven lanzador y exe real.

---

**Estado:** ✅ aprobado el 2026-10-09
