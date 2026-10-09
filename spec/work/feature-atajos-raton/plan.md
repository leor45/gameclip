# Plan — Botones laterales del ratón como atajos

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.

## Enfoque

El hook global de teclado/ratón (`uiohook-napi`) ya está en el proyecto para el push-to-talk; se
generaliza para que también sirva atajos de ratón, y los aceleradores aprenden dos «teclas base»
nuevas.

1. **`src/shared/hotkeys.ts`**
   - `MOUSE_BASE_KEYS = ['Mouse4', 'Mouse5']`; `BASE_KEYS` las incluye (así `isValidAccelerator` y
     `hotkeyCollisions` funcionan sin cambios).
   - `accelFromMousePress({ button, ctrlKey, altKey, shiftKey, metaKey })`: `button` es el del DOM
     (3 = atrás → `Mouse4`, 4 = adelante → `Mouse5`); otros botones → `null`.
   - `isMouseAccelerator(accel)`; `mouseButtonOf(accel)` → 4 | 5 (numeración de libuiohook).
   - `isPttReserved`: con PTT `Mouse4`, el acelerador `Mouse4` choca (y `Ctrl+Mouse4` no).
2. **`src/main/capture/global-hook.ts`** (nuevo): `GlobalHook` envuelve el módulo `uiohook-napi` con
   carga falible, `on(event, cb)` y **recuento de usuarios** (`acquire()`/`release()` arrancan y paran
   `uIOhook`). `PushToTalk` pasa a usarlo (misma API pública, mismos tests).
3. **`src/main/capture/mouse-hotkeys.ts`** (nuevo): `MouseHotkeys` con `register(accel, cb)` y
   `unregisterAll()`. En `mousedown` compara botón y modificadores exactos (`Ctrl+Mouse4` no dispara
   `Mouse4` ni al revés), y llama al callback. Sin registros, suelta el hook.
4. **`src/main/index.ts`**: `registerHotkeys` reparte: `isMouseAccelerator` → `MouseHotkeys`,
   si no → `globalShortcut`; `unregisterAll` de ambos antes de re-registrar y en el `teardown`.
5. **Renderer** (`Atajos.tsx`, `Avanzado.tsx`): mientras `capturando`, listener `mousedown` en
   `window` con `capture: true` + `preventDefault`; botones 0/1/2 → aviso «Solo los botones laterales
   del ratón»; 3/4 → `accelFromMousePress` y misma validación que una tecla (PTT reservado,
   duplicados). También `contextmenu` prevenido durante la captura para que el botón derecho no abra
   el menú.
6. **Sin navegación atrás/adelante con el ratón.** En `createWindow` (`src/main/index.ts`):
   `win.on('app-command', (e, cmd) => { if (cmd === 'browser-backward' || cmd === 'browser-forward')
   e.preventDefault(); })`. Es el único camino por el que Windows/Electron navegan el historial con
   los botones laterales (`WM_APPCOMMAND`), así que basta con eso; por si acaso, el renderer también
   hace `preventDefault` de `mouseup` para los botones 3/4 en `window` (en `App.tsx`), que es lo
   que Chromium usa en otras plataformas. El resto de la navegación de la app no se toca.

## Archivos / módulos afectados

- `src/shared/hotkeys.ts` (+ `src/shared/__tests__/hotkeys.test.ts`)
- `src/main/capture/global-hook.ts` (nuevo), `src/main/capture/mouse-hotkeys.ts` (nuevo),
  `src/main/capture/push-to-talk.ts` (usa el hook compartido)
- `src/main/__tests__/mouse-hotkeys.test.ts` (nuevo), `src/main/__tests__/push-to-talk.test.ts`
- `src/main/index.ts` (`registerHotkeys` + `app-command` en `createWindow`), `src/main/shutdown.ts`
  (si el teardown necesita el `unregisterAll` del ratón)
- `src/renderer/App.tsx` (`mouseup` de los botones 3/4 prevenido)
- `src/renderer/views/ajustes/Atajos.tsx`, `src/renderer/views/ajustes/Avanzado.tsx`
  (+ `src/renderer/__tests__/atajos.test.tsx`, `ajustes-perf.test.tsx`)
- `spec/constitution/roadmap.md` (entrega + futuro «acordes de mando»)

## Decisiones y alternativas consideradas

- **`uiohook-napi` para el ratón** (elegida): ya es dependencia, ya corre para el PTT y da botón +
  modificadores globales. Alternativa descartada: otro addon o helper nativo solo para esto.
- **Solo `Mouse4`/`Mouse5`**: son los botones «extra» estándar; el central se usa en juegos y los
  ratones con más botones los emiten como teclas desde su software (que ya funcionan).
- **No interceptar el botón**: igual que las teclas (`globalShortcut` tampoco las bloquea en el juego).
  Interceptar exigiría consumir el evento en el hook y rompería el uso normal del botón.
- **Recuento de usuarios del hook** frente a dejar que cada consumidor arranque/pare: con dos
  consumidores, parar uno no puede apagar el hook del otro.
- **Navegación del ratón anulada siempre**, no solo cuando hay un atajo de ratón asignado: la app
  nunca se diseñó para navegarse así (hoy es un efecto colateral de Chromium), y condicionarlo haría
  que el mismo botón hiciera cosas distintas según los ajustes.
- **Solo cinco botones de ratón**: Windows y el hook no ven más (`XBUTTON1`/`XBUTTON2` son los
  únicos laterales); los ratones con cuatro laterales emiten los otros dos como teclas desde su
  software, que ya funcionan como atajo de teclado. Verlos «en crudo» exigiría Raw Input HID en un
  helper nativo, fuera de alcance.

## Riesgos

- `uiohook-napi` sin prebuilt para la versión de Electron → igual que hoy con el PTT: los atajos de
  ratón quedan no disponibles y la UI lo dice (`getPttAvailable` ya expone el estado del hook; se
  reutiliza para avisar también en Atajos).
- Numeración de botones: DOM (3/4) frente a libuiohook (4/5). Centralizada en `hotkeys.ts` con tests.

---

**Estado:** ⏳ pendiente de aprobación
