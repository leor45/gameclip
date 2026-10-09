# Spec — El buffer de repetición se pausa durante la grabación manual

**Tipo:** Feature
**Rama:** `feature/buffer-pausado-al-grabar`
**Fecha:** 2026-10-08

## Problema / Objetivo

Desde `fix/grabacion-espera-keyframe` la grabación tiene su propio encoder de vídeo, así que con el
buffer activo y una grabación en curso se codifica dos veces (poco en NVENC/AMF/QSV; con x264 por CPU
se duplica) y libobs mantiene el búfer en RAM/disco sin que sirva de nada: si el usuario está grabando
a mano (botón o atajo), el clip retroactivo sobra. Objetivo: mientras dura una grabación **manual** el
buffer se para, y al terminar arranca de cero solo.

## Alcance

**Dentro:**
- Al arrancar una grabación manual (`startRecording`: botón, atajo, IPC) se para el replay buffer si
  estaba corriendo. Al parar la grabación, la reconciliación existente lo vuelve a arrancar si toca.
- El atajo de replay o el botón del mando durante una grabación manual no tocan libobs y avisan en el
  overlay («Ya estás grabando»).
- La protección del overlay de rendimiento no parpadea al parar el buffer justo antes de grabar.
- Tests de manager para los tres puntos; verificación E2E con el selftest (`GAMECLIP_SELFTEST_CLIP=1`
  pasa a comprobar que durante la grabación no se guarda replay y después sí).

**Fuera (explícito):**
- El modo `auto` (sesión completa) **mantiene el buffer** durante la sesión: ahí el atajo de replay es
  la forma de marcar jugadas sin recortar luego una grabación larga. Decidido con el owner.
- Cambiar la duración o el arranque del buffer en cualquier otro caso.

## Criterios de aceptación

- [x] Con `bufferMode: always`, pulsar grabar para el buffer (`stopReplayBuffer`) antes de
      `startRecording`; al parar la grabación el estado vuelve a `buffering` y el buffer corre.
- [x] Con el buffer parado por una grabación manual, `saveReplay` no llama a libobs y emite
      `replay-skipped`; el overlay muestra «Ya estás grabando».
- [x] En modo `auto`, una sesión de juego graba **con** el buffer activo (sin cambios).
- [x] Al pasar de `buffering` a `recording` en perfil de escritorio no se emite ninguna
      desprotección del overlay (`overlay-protection: false`).
- [x] Selftest real: el clip retroactivo pedido durante la grabación no se produce y el pedido después
      sí; el log de libobs muestra `replay-buffer` parado durante la grabación y arrancado después, y
      la grabación sigue perdiendo solo la latencia inherente (~17 frames).
