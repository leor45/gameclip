# Plan — El clip sale negro en perfil de juego

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Mismo patrón que ya usa el monitor (`resolveMonitorId`): la ventana no se "escribe a mano", se
**resuelve contra la propiedad-lista del source ya creado**.

1. **Helper puro** en `obs.ts`, testeable sin libobs:

   ```ts
   /** Item de la propiedad-lista `window` del game_capture: "titulo:clase:exe". */
   export interface WindowItem { name: string; value: string }

   /** Cadena completa de la ventana del juego, o null si libobs no la ve. */
   export function resolveGameWindow(items: WindowItem[], executable: string | null): string | null;
   ```

   Match por el tercer campo (`exe`), case-insensitive; ignora los items vacíos y el placeholder
   («Seleccionar ventana para capturar»). Devuelve el `value` **completo**, que es lo que libobs
   entiende.

2. **`gameCaptureSettings(settings, window)`** pasa a recibir la ventana **ya resuelta** (no el exe):
   - con ventana → `{ capture_mode: 'window', window, priority: 2 }`
   - sin ventana → `{ capture_mode: 'any_fullscreen' }` (engancha los juegos a pantalla completa;
     nunca dejamos la escena en negro por no encontrar la ventana)

3. **`buildPipeline()`**: crea el `game_capture` con `any_fullscreen`, lee su propiedad-lista
   `window`, resuelve contra el ejecutable detectado y, si hay match, hace `update()` a modo ventana
   con la cadena completa. Es exactamente la secuencia del monitor (la propiedad-lista solo existe en
   el source ya creado).

4. **`updateGameCaptureTarget(exe)`**: misma resolución sobre el source vivo, para que al rotar de
   juego el vídeo siga al nuevo sin reconstruir.

### Test de regresión primero (rojo → verde)

`resolveGameWindow` con los items **reales** capturados por la sonda en la máquina del bug:

```
''                                                        (vacío)
'Buscar:Windows.UI.Core.CoreWindow:SearchHost.exe'
"Marvel's Spider-Man#3A Miles Morales v4.630.0.0:GameNxApp:MilesMorales.exe"
'…- Visual Studio Code:Chrome_WidgetWin_1:Code.exe'
```

→ para `MilesMorales.exe` debe devolver la cadena completa; y el test que fija el bug:
`gameCaptureSettings` **nunca** debe emitir `window: '::<exe>'` (el formato que no matchea nada).

## Archivos / módulos afectados

- `src/main/capture/obs.ts` — `resolveGameWindow()` (nuevo), `gameCaptureSettings()` (recibe la
  ventana resuelta), `buildPipeline()` (resuelve tras crear el source), `updateGameCaptureTarget()`.
- `src/main/__tests__/obs-helpers.test.ts` — regresión con los items reales + `gameCaptureSettings`.

## Decisiones y alternativas consideradas

- **Seguir con `game_capture`** en vez de cambiar a `window_capture` (WGC): la sonda demuestra que el
  hook engancha bien (2560×1440), y el game capture es el que soporta pantalla completa exclusiva y
  no arrastra bordes ni overlays del escritorio.
- **Fallback a `any_fullscreen`** en vez de dejar el source en modo ventana sin match: si el juego
  aún no tiene ventana cuando construimos el pipeline, con `any_fullscreen` el clip sale bien igual;
  al revés, saldría negro (que es justo el bug).
- **No tocar `forceWindowCapture`**: con este arreglo el modo ventana ya funciona de verdad, así que
  el ajuste queda coherente sin cambios.

## Riesgos

- **Juegos que aún no han creado su ventana** cuando aparece el proceso: el pipeline se construye con
  `any_fullscreen` y no se re-resuelve solo. Mitigación: el re-apuntado en caliente ya ocurre en cada
  cambio de juego, y el modo `any_fullscreen` cubre el caso normal (juego a pantalla completa).
- **Títulos con `:`**: libobs los escapa (`#3A`) en su propia lista; como usamos el `value` tal cual,
  no hay que escapar nada por nuestra cuenta.

---

**Estado:** ⏳ pendiente de aprobación
