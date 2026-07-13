# Spec — Silenciado del háptico del DualSense guiado por eventos

**Tipo:** Fix
**Rama:** `fix/haptico-dualsense-event-driven`
**Fecha:** 2026-07-12

## Problema / Objetivo

La feature `feature/silenciar-haptico-dualsense` (v0.5.0) reaplica el muteo **una sola vez por
arranque de captura**, con reintentos durante ~3 s. Pero la sesión de audio de `obs64.exe` en el
dispositivo del DualSense **no se crea al arrancar el juego/la captura, sino cuando el mando emite
audio por primera vez** (típicamente al pulsar un botón), lo que puede ocurrir mucho después de esos
3 s. Resultado: la ventana de reintento expira sin encontrar la sesión y el háptico **no se mutea**;
el owner tiene que ir a Ajustes y volver a guardar (fuerza un rebuild → nueva ventana de reintento,
y para entonces la sesión ya existe) para que surta efecto.

**Causa raíz:** el gatillo elegido (arranque de captura) no coincide con el momento real en que hay
que actuar (creación de la sesión de `obs64.exe` en el dispositivo del mando), que es tardío e
impredecible. Un reintento acotado en el tiempo no puede cubrirlo.

**Objetivo:** silenciar el háptico **en el instante en que aparece la sesión**, sea cuando sea,
reaccionando a eventos del sistema en vez de sondear, y cubrir además la conexión de un mando en
plena partida — todo con consumo de CPU despreciable (event-driven, idle en reposo).

## Alcance

**Dentro:**
- Convertir el helper nativo en un **listener persistente** que escucha eventos de Core Audio:
  - `IAudioSessionManager2::RegisterSessionNotification` → mutea la sesión de `obs64.exe` en cuanto
    `OnSessionCreated` dispara en el dispositivo del mando.
  - `IMMDeviceEnumerator::RegisterEndpointNotificationCallback` → al conectarse/activarse un mando
    nuevo, registra el listener de sesiones en ese dispositivo (re-escaneo idempotente).
  - Al arrancar, mutea las sesiones de `obs64.exe` ya existentes en los dispositivos que matcheen.
- Gestión de ciclo de vida en GameClip: lanzar el listener cuando la opción está activa, pararlo al
  desactivarla o al cerrar la app, y reiniciarlo si cambia el patrón de dispositivo. Sustituye a la
  reaplicación por-arranque-de-captura (que se elimina).
- Salida limpia del listener si el proceso padre muere (sin orphans).

**Fuera (explícito):**
- Renombrar `obs64.exe` a un nombre de marca (spec propio a futuro; es cosmético y no arregla esto).
- Silenciar por canal / rematrix dentro de OBS.
- Soporte fuera de Windows.

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] Con la opción activa: arrancar un juego, **no tocar el mando** unos segundos y **luego** pulsar
      un botón por primera vez → el háptico queda muteado sin intervención (ya no hace falta reabrir
      Ajustes y guardar).
- [ ] Conectar un DualSense **después** de arrancado GameClip/el juego → también queda cubierto y se
      mutea al aparecer su sesión.
- [ ] El audio del juego sigue intacto y la vibración física del mando sigue funcionando.
- [ ] Reiniciar/reconstruir la captura (cambio de juego, re-arranque de buffer) sigue funcionando:
      la sesión nueva de `obs64.exe` se mutea al recrearse.
- [ ] Desactivar la opción o cerrar GameClip detiene el listener (sin proceso huérfano).
- [ ] En reposo el listener no consume CPU perceptible (event-driven, sin polling).
- [ ] Sin DualSense o sin binario, todo es un no-op silencioso: la captura no se ve afectada.
