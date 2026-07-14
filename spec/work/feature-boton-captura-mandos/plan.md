# Plan — Botón de captura del mando (DualSense / Xbox)

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Calcar el patrón ya probado de **`gc-app-audio-mute`**: un **helper nativo `.exe`** persistente que
GameClip arranca cuando la función está activada, y un **wrapper TS** que lo maneja como proceso
hijo. El helper detecta la pulsación del botón de captura por **dos vías en paralelo** y, en cuanto
ocurre, escribe una línea por `stdout`; el wrapper la traduce en una llamada a `manager.saveReplay()`
—la misma acción que el atajo "Guardar clip".

**Dos vías dentro del mismo helper** (verificado en el spec):
1. **HID crudo** (SetupAPI + HidD) para el botón **Create del DualSense** (USB y BT). Sin
   dependencias externas.
2. **GameInput** (`IGameInput` + `RegisterSystemButtonCallback` con `GameInputSystemButtonShare`)
   para el botón **Compartir del Xbox Series**, que cubre **USB y BT** de una vez. Es la única vía
   por la que el botón sale por USB (el hijo HID del Xbox-USB es solo XInput, sin ese botón).

**Por qué un `.exe` nativo** (y no `node-hid` ni WinRT `Windows.Gaming.Input`):
- Sin acoplamiento de ABI con Electron (`node-hid` sería otro addon a recompilar por versión de
  Electron, como `better-sqlite3`); un `.exe` es indiferente.
- Aislado: si el lector HID o GameInput falla, no tumba el main de Electron.
- Encaja con el patrón y la orquestación que ya existe para el háptico
  ([`app-audio-mute.ts`](../../../src/main/capture/app-audio-mute.ts) +
  [`native/app-audio-mute`](../../../native/app-audio-mute)).
- `Windows.Gaming.Input`/XInput **no exponen** el botón de captura (ver spec) → descartadas.

**Espina previa — ✅ VALIDADA (2026-07-13, hardware del owner).** Un probe (`gi-probe.cpp`, MinGW,
carga dinámica de `GameInputInitialize` desde `GameInputRedist.dll`) confirmó que el callback de
`GameInputSystemButtonShare` **dispara con el mando de Xbox por USB** — y, con
`SetFocusPolicy(GameInputEnableBackgroundShareButton)`, **también en segundo plano** (sin que la app
tenga el foco), que es el escenario real de GameClip. 8/8 pulsaciones detectadas, flancos limpios
(`0x0 → 0x2`). Resuelto el riesgo de versión: se enlaza contra la **v3** vía `GameInputRedist.dll`
(el `GameInput.dll` inbox es v0 y NO trae Share).

**Pieza clave confirmada:** sin `SetFocusPolicy(... EnableBackgroundShareButton ...)` el callback
solo llega con foco en primer plano (el primer probe dio 0). Con él, llega siempre. **Imprescindible.**

### Contrato del helper (CLI)

```
gc-controller-listen.exe
```

Sin argumentos. Persistente. Corren en paralelo el **lector HID** y el **listener de GameInput**;
ambos emiten `capture\n` a `stdout` (con flush) en el **flanco de pulsación**. Mantener pulsado no
repite. **Bloquea leyendo `stdin`** igual que `gc-app-audio-mute --watch`: al cerrar GameClip el pipe
da EOF y el helper sale sin quedar huérfano. Siempre devuelve 0.

**Vía HID (DualSense):**
- Enumera dispositivos HID y se queda con la **allowlist por VID/PID**: DualSense VID `0x054C`, PID
  `0x0CE6` (y `0x0DF2` Edge).
- Abre cada mando con `ReadFile` **solapado** y espera con `WaitForMultipleObjects` sobre los eventos
  de lectura **+ timeout corto** (~2 s) que dispara **re-escaneo** para hotplug (sin message loop).
- Decodifica el bit **Create**: byte de botones del input report, con **offset distinto por USB vs
  BT** (report id `0x01` vs `0x31`). Offsets/máscaras exactos se fijan contra el mando real.

**Vía GameInput (Xbox Compartir, USB y BT) — validada:**
- `GameInputInitialize(IID_IGameInput, …)` → `IGameInput`; **`SetFocusPolicy(GameInputEnableBackground
  Input | GameInputEnableBackgroundShareButton)`** (imprescindible, ver espina); luego
  `RegisterSystemButtonCallback(nullptr, GameInputSystemButtonShare, …)`. El callback llega en hilo
  propio de GameInput; en el flanco `share 0→1` se emite `capture`.
- Cubre USB **y** BT del Xbox sin decodificar HID. Si el runtime no carga, esta vía es **no-op** y la
  HID (DualSense) sigue.
- Enlace desde **MinGW**: carga dinámica de `GameInputInitialize` desde **`GameInputRedist.dll`**
  (`LoadLibrary`/`GetProcAddress`) usando las interfaces de `GameInput.h` (NuGet `Microsoft.GameInput`
  v3.3.221, vendorizado), sin depender del `.lib` MSVC. El `GameInput.dll` inbox (v0) NO sirve.

### Orquestación (lado GameClip)

- El **`CaptureManager`** posee el listener (igual que `hapticListener`) y lo reconcilia con una
  función `applyControllerListener()`, llamada en `initialize()` y en `setSettings()`. Idempotente:
  arranca/para el proceso según `controllerCaptureEnabled`.
- Al llegar `capture` por stdout, el listener invoca el callback `() => void manager.saveReplay()`.
  `saveReplay()` ya es seguro: si el estado no permite guardar (no hay buffer, modo off), es no-op.
- Es un **motor aparte de los atajos de teclado** (como el push-to-talk sobre uiohook): no pasa por
  `HOTKEY_ACTIONS`/`globalShortcut`, así que **no hay colisiones** que gestionar con el teclado.

## Archivos / módulos afectados

- `native/gc-controller-listen/` **(nuevo)** — fuente C++ (`main.cpp` con las dos vías) + `README.md`
  de build y contrato. **NO** se vendoriza `GameInput.h` (ver decisión de licencia).
- `scripts/build-controller-listen.ps1` **(nuevo)** — compila el `.exe`, calcado de
  [`build-haptic-mute.ps1`](../../../scripts/build-haptic-mute.ps1) (MSVC o **MinGW g++** de fallback,
  que es lo que hay en la máquina del owner); **descarga el NuGet `Microsoft.GameInput` a `build/`
  (git-ignored) para obtener `GameInput.h`** si no está cacheado; enlaza `hid.lib` + `setupapi.lib`;
  GameInput por carga dinámica (sin `.lib`). Deja `resources/gc-controller-listen.exe`.
- `resources/gc-controller-listen.exe` **(artefacto de build, git-ignored)** — como el del háptico.
- `.gitignore` — añadir `resources/gc-controller-listen.exe`.
- `package.json` — `build:native` compila **los dos** helpers (háptico + mandos).
- `src/main/capture/controller-capture.ts` **(nuevo)** — wrapper TS `ControllerCaptureListener`
  (calco de `HapticMuteListener`): resuelve la ruta del helper (dev vs `process.resourcesPath`), lo
  spawnea, lee líneas de `stdout` e invoca `onCapture` en cada `capture`. Best-effort: sin binario,
  no-op silencioso.
- `src/main/capture/manager.ts` — inyectar `controllerListener` en el constructor, `applyController
  Listener()` en `initialize()`/`setSettings()`, `stop()` en `shutdown()`.
- `src/shared/capture.ts` — nuevo ajuste `controllerCaptureEnabled: boolean` (default `false`) en la
  interfaz, `DEFAULT_CAPTURE_SETTINGS` y `normalizeCaptureSettings`.
- `src/renderer/views/ajustes/Atajos.tsx` — nuevo `fieldset` con el checkbox **"Habilitar botón de
  captura de mandos"** + hint (DualSense y Xbox por Bluetooth; nota del límite de Xbox por USB y de
  Game Bar).
- `electron-builder.yml` — añadir `resources/gc-controller-listen.exe` a `extraResources`.
- Tests: `src/main/__tests__/controller-capture.test.ts` **(nuevo)**; ampliar
  `src/shared/__tests__/capture.test.ts` y `src/renderer/__tests__/atajos.test.tsx`.

## Decisiones y alternativas consideradas

- **`.exe` propio** vs **`node-hid`** — elegido el `.exe`: sin ABI con Electron, aislado, y reutiliza
  el patrón `spawn`/stdout ya montado para el háptico. Además `node-hid` no cubriría Xbox-USB.
- **`.exe` propio** vs **`Windows.Gaming.Input`/XInput** — descartado: **no exponen** el botón de
  captura. Es la razón técnica de fondo de toda la feature.
- **GameInput para Xbox** (USB+BT) vs HID para Xbox-BT — se unifica Xbox en GameInput: por USB es la
  **única** vía (confirmado: el hijo HID del Xbox-USB es solo XInput), y de paso cubre BT sin
  decodificar el report `0x02`. El DualSense se queda en HID para no atarlo a GameInput.
- **DualSense por HID** vs también por GameInput — HID no añade dependencias y es terreno conocido en
  el repo; si el probe muestra que GameInput también da el Create del DualSense, se simplifica luego.
- **GameInput por carga dinámica** vs enlazar el `.lib` del SDK — carga dinámica para poder compilar
  con MinGW (la máquina no tiene MSVC) y para degradar limpio si el runtime no está.
- **`GameInput.h` descargado en build (no vendorizado)** — GameClip es **GPL-3.0** y la licencia del
  redistribuible de Microsoft (§3.c.ii) prohíbe distribuir su fuente bajo copyleft. El build baja el
  NuGet a `build/` (git-ignored); el header nunca se commitea. El `.exe` solo usa el runtime que el
  usuario ya tiene.
- **Un único toggle → siempre "Guardar clip"** (decisión del owner) vs desplegable de acción — se
  fija "Guardar clip". Elegir acción sería otro spec.
- **Manager dueño del listener** (como `hapticListener`) vs cablearlo en `index.ts` — el manager ya
  reconcilia listeners con los ajustes y expone `saveReplay()`; encaja sin pasar callbacks por IPC.
- **Flanco de pulsación en el helper** (no en TS) — el helper ya tiene el estado por dispositivo;
  así por stdout viaja un evento limpio por pulsación y el wrapper queda tonto y testeable.
- **Re-escaneo por timeout** vs `WM_DEVICECHANGE` — el timeout corto evita montar un message loop y
  basta para el hotplug; mismo espíritu "event-driven + rescan" que el helper del háptico.

## Riesgos

- **GameInput: versión y ABI — ✅ resuelto por la espina.** Se enlaza contra la v3 vía
  `GameInputRedist.dll` (no el inbox v0). Callback validado con hardware real, incluido en segundo
  plano. Queda como riesgo residual solo la disponibilidad del runtime en el usuario final (abajo).
- **Dependencia de runtime de GameInput** en el usuario final: inbox en Win11 24H2+, redist en otros.
  Si falta, la vía Xbox es no-op (el DualSense sigue). No lo instala GameClip (fuera de alcance).
- **Offsets/PIDs de HID contra hardware real (DualSense):** los bytes del botón Create se fijan
  probando con el mando. Riesgo = "no dispara", degradación, no crash.
- **DualSense por Bluetooth en report "simple":** por BT el mando puede emitir el report reducido
  `0x01` hasta que se lee el feature report de calibración (`0x05`), que activa el report completo
  `0x31`. El helper debe forzar/decodificar el modo correcto; detalle a verificar.
- **El helper nativo no entra en la suite unitaria** (HID/GameInput + hardware), igual que
  `gc-app-audio-mute`: se cubre con verificación manual/E2E. Lo unit-testeable es el wrapper TS.
- **Doble captura con Xbox Game Bar:** si el usuario dejó el botón Compartir mapeado a Game Bar,
  puede dispararse también la captura de Windows. No lo tocamos; se documenta en el hint.
- **HidHide/ViGEm:** si el usuario oculta el mando físico a las apps, el lector HID no lo verá
  (GameInput sí, según cómo esté configurado HidHide). Se anota; no se gestiona.
- **Empaquetado:** que el `.exe` no llegue a `resources/` del portable → criterio de aceptación de
  instalación limpia.
- **SmartScreen/antivirus** sobre un `.exe` propio sin firmar: mismo caso ya asumido con
  `gc-app-audio-mute`; firmar queda fuera de alcance (se anota).
- **Estabilidad del lector:** un mando que se desconecta a mitad de lectura no debe tumbar el helper
  (manejar el error de `ReadFile` re-escaneando). Cubierto por el diseño de rescan.

---

**Estado:** ✅ aprobado el 2026-07-14 (con USB de Xbox en alcance vía GameInput)
