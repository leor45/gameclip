# Plan — El audio del juego se cuela en todas las pistas (bleed de la fuente de vídeo)

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Apagar la captura de audio en las dos fuentes de **vídeo** con `capture_audio: false`, en los mismos
helpers puros que ya generan sus settings (`gameCaptureSettings`, `monitorCaptureSettings`). Así el
audio deja de salir del source de vídeo y fluye solo por las fuentes wasapi dedicadas, que ya tienen
su `audioMixers` (reparto por rol) y su `obs_fader` (volumen). Al ir en los helpers, el fix se aplica
tanto en `buildPipeline()` como en cada rebuild y en el re-apuntado en caliente del auto-switch (que
reusan esos mismos helpers), sin tocar nada más.

Test de regresión primero (rojo → verde) sobre los helpers, sin necesidad de libobs.

## Archivos / módulos afectados

- `src/main/capture/obs.ts` — `capture_audio: false` en `monitorCaptureSettings` y `gameCaptureSettings`.
- `src/main/__tests__/obs-helpers.test.ts` — dos tests de regresión.

## Decisiones y alternativas consideradas

- Apagar `capture_audio` en el source de vídeo (elegida) vs. fijarle `audioMixers = 0` tras crearlo.
  Apagarlo en el helper es puro y testeable sin libobs, y no deja al source decodificando audio que
  luego se descarta. `audioMixers = 0` quedaría como cinturón-y-tirantes, pero no hace falta.

## Riesgos

- Si en alguna build el juego solo tuviera audio vía `game_capture` (no vía
  `wasapi_process_output_capture`), apagarlo lo dejaría mudo. Mitigado: el audio del juego ya sale de
  su fuente wasapi dedicada con fader y pista; `gameAudioEnabled` (default true) la crea.

---

**Estado:** ✅ aprobado el 2026-07-12 (owner dio OK al enfoque antes de codear)
