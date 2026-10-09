# Spec — El push-to-talk se puede poner en una tecla que ya es atajo

**Tipo:** Fix
**Rama:** `fix/ptt-colision-atajos`
**Fecha:** 2026-10-09

## Problema / Objetivo

Auditoría bug-hunter C, C1-BUG-1 (Medium). En Ajustes → Audio se puede elegir como tecla de
push-to-talk una que ya es un atajo (los defaults F6/F7/F8/F10, o desde la v0.9.7 Mouse4/Mouse5), y
nada lo impide. Como el atajo se registra igual y el hook del PTT ve la misma tecla, **cada vez que
hablas se dispara la acción**: con PTT=F8 se guarda un clip, con PTT=F7 se arranca o para una
grabación. «Restablecer atajos por defecto» en Atajos tampoco comprueba el PTT.

**Causa raíz:** la reserva era de un solo sentido. `isPttReserved` se aplica al capturar un atajo
(Atajos, Avanzado), pero el selector del PTT en `Audio.tsx` ofrece todas las `PTT_HOTKEY_OPTIONS`
sin mirar los atajos, y `restablecer()` escribe los defaults sin pasar por la reserva.

## Alcance

**Dentro:**
- `hotkeyReservedByPtt(settings, pttHotkey?)` en `@shared/hotkeys`: la acción cuyo atajo es la misma
  pulsación que la tecla del PTT (activas o no, como la reserva existente).
- Audio: las teclas ocupadas salen deshabilitadas con el nombre de la acción; un choque ya guardado
  con el PTT activo avisa y bloquea el guardado.
- Atajos: «Restablecer» no pone un default en la tecla del PTT y dice cuál se saltó.
- Tests de regresión.

**Fuera (explícito):**
- Que el main ignore en tiempo de ejecución un atajo en la tecla del PTT (no se sabe cuál de los dos
  quería el usuario; la UI ya impide crear el choque y avisa del existente).

## Criterios de aceptación

- [ ] En Audio, F8 (atajo de «Guardar clip») sale deshabilitada como tecla de PTT; F9 no.
- [ ] Con un PTT activo guardado en la tecla de un atajo, Audio avisa y no deja guardar.
- [ ] «Restablecer» con el PTT en F8 deja «Guardar clip» como estaba y lo explica; el resto se
      restablece.
- [ ] Suite verde.
