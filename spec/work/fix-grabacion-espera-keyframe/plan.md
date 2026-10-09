# Plan — La grabación manual pierde el arranque

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Separar el encoder de la grabación del encoder del replay buffer.

En obs-studio-node, el `AdvancedReplayBuffer` con `usesStream = false` toma el encoder de la
`AdvancedRecording` que se le asigna en `replayBuffer.recording`. Hoy esa es la misma grabación
que arrancamos con el atajo. Para separarlos:

1. **Una `AdvancedRecording` «anfitriona» del buffer**, que nunca se arranca y solo presta su
   encoder (`gameclip-venc`) al replay buffer. Es el mismo esquema que hoy, pero sin que la
   grabación real dependa de él.
2. **La `AdvancedRecording` real**, con un encoder nuevo (`gameclip-venc-rec`) y los mismos ajustes
   de rate control. Ese encoder está parado mientras no se graba, y al empezar arranca desde cero:
   el primer frame es keyframe y no hay espera.

La construcción de encoders y salidas se saca de `buildPipeline` a un helper (`buildOutputs`), que
recibe el módulo osn por parámetro. Así se puede probar con un osn falso sin montar el pipeline
entero, que es justo lo que el test de teardown actual evita por ser demasiado pesado.

**Paso 0, antes de tocar nada:** medir la línea base con una tanda de 20 selftests sobre `main` y
anotar `drawn − output` de cada una. Después, el primer cambio es un prototipo del encoder separado
para comprobar que osn lo admite (que el buffer funcione con una grabación anfitriona sin arrancar).
**Si osn no lo admite**, paro y te lo cuento antes de seguir. El plan B sería fijar `keyint_sec = 1`
en el encoder compartido: no cuesta nada, pero la grabación seguiría perdiendo hasta ~1 s al
empezar.

## Archivos / módulos afectados

- `src/main/capture/obs.ts`:
  - `buildOutputs()` crea dos encoders y dos `AdvancedRecording` (anfitriona y real) y el replay
    buffer colgado de la anfitriona;
  - `buildPipeline` lo usa;
  - `teardownPipeline` destruye las dos grabaciones y libera los dos encoders, en el orden que ya
    usa: salidas antes que encoders;
  - las interfaces `Osn*` se tocan solo si hace falta.
- `src/main/__tests__/obs-helpers.test.ts`: test de regresión (la grabación y el buffer no
  comparten encoder; el encoder de grabación lleva los mismos ajustes) y teardown sin fugas con dos
  encoders.
- `spec/constitution/roadmap.md`: cerrar el bug abierto con la causa real y el dato de la tanda.

`manager.ts` no cambia: sigue llamando a `startRecording`, `stopRecording` y `saveReplay` igual.

## Decisiones y alternativas consideradas

- **Encoder propio para la grabación** (elegida): pérdida cero al empezar y elimina el aviso de
  `video_t`.
- **Bajar el GOP (`keyint_sec = 1` o `2`) y seguir compartiendo** (descartada como fix principal,
  queda como plan B): es trivial y no cuesta rendimiento, pero solo acota la pérdida a ~1–2 s, no
  la elimina. Además cambiaría también los clips retroactivos.
- **Parar el buffer mientras se graba** (descartada): rompe guardar clips durante una sesión del
  modo `auto`.

## Riesgos

- **Coste mientras se graba con el buffer activo:** se codifica dos veces.
  - Con NVENC, AMF o QSV, que son el caso por defecto y el tuyo, es hardware dedicado y el coste es
    pequeño.
  - Con x264, por CPU, se duplica el uso de CPU mientras dure la grabación. En el modo `auto` eso
    es toda la sesión. Lo mediré con NVENC; con x264 lo dejaré anotado como coste conocido.
- **Límite de sesiones de NVENC** en GPUs de consumo (5–8 simultáneas): dos sesiones nuestras más
  la de otra app (Discord, la NVIDIA App) caben, pero lo anoto.
- **Comportamiento no documentado de osn** con una grabación anfitriona que nunca arranca. Lo cubre
  el prototipo del paso 0, con el plan B como salida.
- **Intermitencia:** como pasó en julio, unas pocas ejecuciones verdes no demuestran nada. Por eso
  el criterio es una tanda de 20 con la medida de cada una, no «salió bien tres veces».

---

**Estado:** ✅ aprobado el 2026-10-08
