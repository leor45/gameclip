# Tasks — La grabación manual pierde el arranque

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 0. Prueba predictiva en el código actual: selftest con retardo controlado entre el arranque
      del buffer y el de la grabación (1,0 s y 3,0 s). Predicción a 60 fps: pérdida de
      250 − 60 + 17 = **207** y 250 − 180 + 17 = **87** frames (±5). Si no cuadra, la causa no es
      la del spec y se para.
- [x] 0b. Línea base: 20 selftests en el código actual, anotar `drawn − output` de `recording` y
      `replay-buffer` de cada ejecución.
- [x] 1. Prototipo del encoder separado: comprobar que el replay buffer funciona colgado de una
      grabación anfitriona que no se arranca (si no, parar y consultar el plan B).
- [x] 2. Extraer `buildOutputs()` en `obs.ts`, con dos encoders y dos grabaciones.
- [x] 3. `teardownPipeline`: destruir las dos grabaciones y liberar los dos encoders.

## Tests unitarios (obligatorios)

Si es un Fix: el test de regresión va primero (rojo → verde).

- [x] Regresión: la grabación y el replay buffer usan encoders de vídeo distintos (rojo con el
      diseño actual).
- [x] El encoder de grabación lleva los mismos ajustes de rate control que el del buffer.
- [x] Teardown: se destruyen las dos grabaciones y se liberan los dos encoders, salidas antes que
      encoders.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`)
- [x] Tanda de 20 selftests con el fix: ninguna grabación pierde más de ~30 frames y ninguna sale
      con 1 frame.
- [x] Clip retroactivo válido durante una grabación y fuera de ella.
- [~] Modo `auto`: sesión grabada y clip retroactivo a la vez — no probado E2E con juego real; `startSessionRecording` usa el mismo `obs.startRecording()` y el buffer siguió guardando clips durante una grabación en la prueba combinada.
- [x] Varios rebuilds seguidos sin encoders renumerados en el log.

## Cierre

- [x] Aprobación del owner
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
