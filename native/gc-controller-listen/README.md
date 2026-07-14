# gc-controller-listen

Helper nativo de Windows que escucha el **botón de captura del mando** y escribe una línea `capture`
por `stdout` en cada pulsación. GameClip lo usa para guardar un clip con el botón dedicado del mando
(equivalente al atajo "Guardar clip"). Ver `spec/work/feature-boton-captura-mandos`.

## Contrato (CLI)

```
gc-controller-listen.exe
```

Sin argumentos. Persistente. Escucha por **dos vías en paralelo**:

- **HID crudo → DualSense** (VID `054C`, PID `0CE6` / `0DF2`): decodifica el botón **Create** del
  input report (USB y Bluetooth). Enumera con SetupAPI + HidD, lee solapado y re-escanea cada ~2 s
  para hotplug.
- **GameInput → Xbox** (system button **Share**): `RegisterSystemButtonCallback(GameInputSystemButton
  Share)` con `SetFocusPolicy(EnableBackgroundShareButton)` para recibir el botón **en segundo plano**
  (sin foco). Cubre USB y Bluetooth. Requiere el runtime de GameInput (`GameInputRedist.dll`); si no
  está, esta vía queda inactiva y la de HID sigue.

Emite `capture\n` solo en el **flanco de pulsación** (mantener pulsado no repite). **Bloquea leyendo
`stdin`**: cuando el padre cierra el pipe (o muere) llega EOF y el proceso sale (sin huérfano).
Siempre devuelve 0.

## Dependencia de GameInput (solo para Xbox)

- **Cabeceras (build):** el NuGet `Microsoft.GameInput` — `scripts/build-controller-listen.ps1` lo
  descarga a `build/gameinput-sdk/` (git-ignored) para obtener `GameInput.h`. **No se vendoriza en el
  repo**: GameClip es GPL-3.0 y la licencia del redistribuible de Microsoft (§3.c.ii) no permite
  redistribuir su fuente bajo copyleft.
- **Runtime (usuario final):** `GameInputRedist.dll`. Inbox en Windows 11 24H2+; en otras versiones
  llega con la app *Accesorios de Xbox* de Microsoft Store. Se carga dinámicamente; si falta, la vía
  Xbox es no-op.

## Compilar

Con las **Build Tools de Visual Studio** (o el "Developer Command Prompt"), o con **MinGW g++**
(WinLibs), desde la raíz del repo:

```
./scripts/build-controller-listen.ps1
```

Deja el binario en `resources/gc-controller-listen.exe` (CRT estático, sin runtime externo). Ese
`.exe` es un artefacto de build git-ignored (como `gc-app-audio-mute.exe`) y electron-builder lo
empaqueta en el portable vía `extraResources`.
