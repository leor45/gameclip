# Spec — Botón de captura del mando (DualSense / Xbox)

**Tipo:** Feature
**Rama:** `feature/boton-captura-mandos`
**Fecha:** 2026-07-13

## Problema / Objetivo

Hoy solo se puede guardar un clip con un atajo de teclado (`replayHotkey`, F8 por defecto) o desde
la bandeja. Jugando con mando, alcanzar el teclado rompe la partida. Las consolas resuelven esto con
un **botón físico dedicado a la captura** —el botón **Share/Create** del DualSense (PS5) y el botón
**Compartir** del mando de Xbox Series—, y el usuario ya tiene ese gesto interiorizado.

**Objetivo:** que ese mismo botón del mando **guarde un clip** en GameClip (equivalente a pulsar el
atajo "Guardar clip"), sin quitar los atajos de teclado ya existentes. Un único interruptor en
Ajustes lo activa: **"Habilitar botón de captura de mandos"**. Al activarlo, el botón de captura del
DualSense y el del mando de Xbox disparan el guardado del clip retroactivo.

## Contexto técnico (por qué no es "leer un botón normal")

El botón de captura **no** sale por la vía estándar de gamepad, y hay **dos vías** de lectura según
el mando y el transporte. Verificado empíricamente sobre el hardware del owner (ver
`## Verificación` al final):

- **XInput no expone** el botón Share del mando de Xbox (su struct no tiene ese bit).
- **DualSense (USB y BT):** se presenta como `Dispositivo de juego HID` (VID_054C&PID_0CE6); el botón
  **Create** viaja en el input report. Legible por **HID crudo**.
- **Xbox Series por Bluetooth:** enumera como `Dispositivo de juego HID` (VID_045E&PID_0B13); el
  botón **Compartir** es legible por HID **o** por GameInput.
- **Xbox Series por USB:** usa el driver GameInput de Microsoft (`dc1-controller` / `XboxComposite`)
  y su **único hijo HID es el dispositivo XInput** (PID_02FF), que **no** lleva el botón Compartir.
  Por HID crudo **no** se puede. **Sí** se puede por la **API GameInput**
  (`IGameInput::RegisterSystemButtonCallback` → `GameInputSystemButtonShare`), que es exactamente la
  vía por la que Xbox Game Bar lo captura por USB.

**Conclusión:** DualSense y Xbox-BT por **HID crudo**; el botón Compartir de Xbox (USB **y** BT) por
**GameInput**. GameInput unifica ambos transportes de Xbox en un solo callback.

## Alcance

**Dentro:**
- Helper nativo propio de Windows que detecta la pulsación del botón de captura por **dos vías**:
  - **HID crudo** para el botón Create del **DualSense** (USB y BT).
  - **GameInput** (`GameInputSystemButtonShare`) para el botón Compartir del **Xbox Series**, tanto
    **USB como Bluetooth**.
- Integración en GameClip: al recibir el evento, ejecutar la acción **"Guardar clip"**
  (`saveReplay`), la misma que el atajo de teclado.
- Un ajuste booleano **"Habilitar botón de captura de mandos"** en Ajustes → Atajos (por defecto
  **desactivado**).
- Empaquetado del binario nativo junto a la app (build + electron-builder), igual que
  `gc-app-audio-mute`.
- Degradación limpia si el runtime de GameInput no está disponible: la parte de Xbox queda como
  no-op y el DualSense (HID) sigue funcionando.
- (Añadido a pedido) En el overlay de aviso de juego, bajo los atajos, se anuncia "Captura con
  mandos habilitada" cuando la opción está activa.

**Fuera (explícito):**
- Runtime de GameInput como dependencia que GameClip **instale**: se asume presente (inbox en
  Windows 11 24H2+, redist en otros). Si falta, la parte de Xbox degrada (no se instala nada).
- Mapear el botón a otra acción distinta de "Guardar clip" (grabar/parar, captura de pantalla). El
  botón siempre guarda clip. Elegir la acción sería otro spec.
- Rebind del botón, soporte de otros mandos (Switch Pro, genéricos), o vibración/LED del mando.
- Convivencia con Xbox Game Bar: si el usuario tiene el botón Compartir mapeado a Game Bar en
  Windows, ambos pueden dispararse. No lo desactivamos por él; se documenta como nota.
- Convivencia con software de virtualización de mandos (HidHide/ViGEm): si el usuario oculta el
  mando físico a las apps, el lector HID no lo verá. No se gestiona; se anota.
- Cualquier plataforma que no sea Windows.

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] Con la opción **activada** y un **DualSense** conectado (USB o Bluetooth), pulsar el botón
      **Create** guarda un clip (mismo efecto que el atajo "Guardar clip": aparece el clip y el
      toast/overlay de confirmación).
- [ ] Con la opción **activada** y un **mando de Xbox Series por Bluetooth**, pulsar el botón
      **Compartir** guarda un clip.
- [ ] Con la opción **activada** y un **mando de Xbox Series por USB**, pulsar el botón
      **Compartir** guarda un clip (vía GameInput).
- [ ] Si el runtime de GameInput no está disponible, la parte de Xbox es un no-op silencioso y el
      DualSense (HID) sigue guardando clips con su botón.
- [ ] Los atajos de teclado siguen funcionando igual, en paralelo, con la opción activada o no.
- [ ] Con la opción **desactivada**, el botón del mando **no** guarda nada y GameClip no abre ningún
      proceso lector de mandos.
- [ ] Sin ningún mando conectado (o con la captura en un estado que no permite guardar), la opción
      es un **no-op silencioso**: no rompe nada ni genera errores visibles.
- [ ] Mantener pulsado el botón guarda **un** clip, no una ráfaga (solo dispara en el flanco de
      pulsación).
- [ ] Conectar/desconectar el mando con la app abierta funciona sin reiniciar (hotplug).
- [ ] El binario nativo se incluye en el paquete portable y funciona en una instalación limpia.

## Verificación (enumeración en el equipo del owner, 2026-07-13)

Comprobado con los mandos conectados, para fijar la vía de cada uno:

- **DualSense:** `HID\VID_054C&PID_0CE6…` como `Dispositivo de juego HID` (USB y BT). → HID crudo.
- **Xbox por Bluetooth:** `HID\…VID_045E&PID_0B13…IG_00` como `Dispositivo de juego HID`. → HID o
  GameInput.
- **Xbox por USB:** `USB\VID_045E&PID_0B12`, clase `XboxComposite`, servicio **`dc1-controller`**
  ("Xbox Controller"); su **único hijo** es `USB\VID_045E&PID_02FF&IG_00` = dispositivo **XInput**.
  No hay colección HID de juego/consumidor con el botón Compartir. → **solo GameInput**.
- **GameInput disponible:** `C:\Windows\System32\GameInput.dll` (inbox v0.2309.26100) + redistribuible
  `Microsoft GameInput v3.3.221` en Program Files + servicio **`GameInputSvc` corriendo**.
- **Toolchain de la máquina:** sin MSVC; se compila con **MinGW g++** (WinLibs), como el helper del
  háptico. Sin cabeceras del SDK de GameInput (hay que traer el NuGet `Microsoft.GameInput`).
- **Nota de entorno:** hay **Nefarius ViGEmBus + HidHide** instalados (remapeo/virtualización de
  mandos); HidHide puede ocultar mandos físicos a las apps.
- **Prueba de lectura del botón Compartir por GameInput (✅):** un probe compilado (MinGW, carga
  dinámica de `GameInputInitialize` desde `GameInputRedist.dll` v3) detectó el botón Compartir del
  Xbox **por USB** 8/8 veces, con `SetFocusPolicy(GameInputEnableBackgroundShareButton)` activo →
  **funciona también con la app en segundo plano**, que es el caso de uso real. Flancos limpios
  `0x0 → 0x2`. El botón Guía también llega. Riesgo de versión/ABI descartado.
