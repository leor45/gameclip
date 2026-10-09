# Spec — Con un DualSense conectado, un segundo DualSense no se detecta

**Tipo:** Fix
**Rama:** `fix/mando-segundo-dualsense`
**Fecha:** 2026-10-09

## Problema / Objetivo

Auditoría bug-hunter D, D3-BUG-1 (Low), confirmado por un árbitro independiente. Con el «botón de
captura de mandos» activo y un DualSense ya conectado, un segundo DualSense (o DualSense Edge) que se
conecte después no se abre nunca: su botón Create no guarda clip hasta que el primero se desconecta.
Por la misma causa, un mando que se desconecta y vuelve mientras otro sigue conectado tampoco se
reabre.

**Causa raíz:** en `native/gc-controller-listen/main.cpp`, `runHidLoop` solo llamaba a `rescan()`
(el sondeo de hotplug) cuando `WaitForMultipleObjects(..., 2000)` devolvía `WAIT_TIMEOUT`. Un DualSense
abierto completa lecturas solapadas sin parar (input reports a ~250 Hz por USB, y también en el modo
de report completo por Bluetooth), así que con uno abierto la espera no agota nunca el timeout y el
re-escaneo no vuelve a correr. Viene de la feature original (`feature/boton-captura-mandos`, commit
`3218d33`): su plan confiaba el hotplug a ese timeout y el README del helper promete re-escanear cada
~2 s, pero el timeout solo llega si no hay eventos, y con un mando abierto siempre los hay.

## Alcance

**Dentro:**
- Re-escanear por tiempo transcurrido: tras cada resultado de la espera (timeout o evento), si han
  pasado ≥ 2 s desde el último re-escaneo. Se mantienen el timeout de 2 s y el re-escaneo inmediato
  al agotarlo.

**Fuera (explícito):**
- La apertura de los mandos, la decodificación de los reports, la vía GameInput (Xbox), la parada por
  EOF de stdin y el protocolo de salida (`capture` por stdout): no cambian.
- Sustituir el sondeo por notificaciones de PnP (`RegisterDeviceNotification`/`CM_Register_Notification`).
- El bucle activo preexistente si `WaitForMultipleObjects` devuelve `WAIT_FAILED` (solo con un handle
  nulo, es decir, si `CreateEventW` falla por falta de recursos): no lo introduce ni lo empeora este
  arreglo; se anota para otra tarea.

## Criterios de aceptación

- [ ] Con un DualSense abierto que reporta sin parar, un segundo DualSense conectado después se abre
      en el siguiente re-escaneo (~2 s) y su botón Create emite `capture`.
- [ ] Las pulsaciones del primer mando se siguen atendiendo igual.
- [ ] Sin mandos conectados, el re-escaneo sigue al mismo ritmo que antes (cada vez que la espera
      agota los 2 s).
- [ ] Sin bucle activo: como mucho un re-escaneo cada ~2 s, sea cual sea el ritmo de eventos.
- [ ] El helper compila con el mismo compilador y flags sin warnings nuevos.
