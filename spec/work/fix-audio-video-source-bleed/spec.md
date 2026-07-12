# Spec — El audio del juego se cuela en todas las pistas (bleed de la fuente de vídeo)

**Tipo:** Fix
**Rama:** `fix/audio-video-source-bleed`
**Fecha:** 2026-07-12

## Problema / Objetivo

En los clips de juego con pistas separadas, el audio del juego aparece en **todas** las pistas y
**duplicado** en la de la mezcla y en la del juego:

- pista `mic` = micro **+ juego**
- pista `discord` = discord **+ juego**
- pista `game` = juego **duplicado y distorsionado** (dos copias desfasadas → cancelación de fase)
- pista `default` (mezcla) = todo, con el juego **duplicado y a volumen completo** ("super alto")

Además, el juego se oye a tope **aunque se le baje el volumen** en Ajustes: el volumen de settings
solo afecta a la fuente wasapi (va por `obs_fader`), no a la copia que se cuela.

**Causa raíz:** la fuente de **vídeo** también captura audio. Desde
`feature/captura-escritorio-vs-juego`, el perfil `game` usa `game_capture` como única fuente de
vídeo (y el perfil `desktop`, `monitor_capture` en modo WGC). Ambos sources de `win-capture.dll`
traen `capture_audio` activo en esta build, y en `buildPipeline()` **nunca se les asigna
`audioMixers`**: sin asignar, libobs deja el default = **todas las pistas** (`0x3F`). Ese source de
vídeo:

- no pasa por `obs_fader` → suena a volumen completo, ignorando el ajuste de volumen del juego;
- va a todas las pistas → se cuela en `mic`, `discord`, etc.;
- se suma a la fuente wasapi del juego (que sí está bien enrutada y fadeada) → el juego queda
  duplicado en la mezcla y en la pista `game`, con phasing por el desfase entre ambas copias.

Introducido al cambiar la fuente de vídeo del perfil `game` a `game_capture` (antes el vídeo salía
siempre de `monitor_capture` y el audio del juego no se duplicaba por este camino).

## Alcance

**Dentro:**
- `capture_audio: false` en `gameCaptureSettings` y en `monitorCaptureSettings`: las fuentes de
  vídeo dejan de producir audio. Todo el audio fluye solo por las fuentes wasapi dedicadas, que sí
  tienen su `audioMixers` (reparto por rol) y su `obs_fader` (volumen).
- Test de regresión (rojo → verde) en `obs-helpers.test.ts`: ambos settings emiten
  `capture_audio: false`.

**Fuera (explícito):**
- No se toca el reparto de pistas (`audioTrackLayout`), los faders de volumen, ni la lógica de
  vídeo/auto-switch: el fix es ortogonal a todo eso.
- No se cambia el editor ni la exportación.

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] En un clip de juego con pistas separadas, cada pista de rol contiene **solo** su fuente: `mic`
      solo el micro, `discord` solo discord, `game` el juego una sola vez y sin distorsión.
- [ ] El audio del juego responde al ajuste de volumen (bajarlo en Ajustes lo baja en el clip).
- [ ] Con el audio del juego desactivado (`gameAudioEnabled: false`), el juego **no** suena.
- [ ] La grabación de escritorio sigue capturando todo el audio del PC (no depende del bleed).
- [ ] El auto-switch escritorio → juego sigue cambiando la fuente de vídeo igual que antes.
- [ ] Gates verdes: type-check · lint · tests.
