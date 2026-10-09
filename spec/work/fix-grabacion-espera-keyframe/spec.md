# Spec — La grabación manual pierde el arranque (hasta un MP4 de un solo frame)

**Tipo:** Fix
**Rama:** `fix/grabacion-espera-keyframe`
**Fecha:** 2026-10-08

## Problema / Objetivo

La grabación manual (atajo de start/stop, modo escritorio y el corte de sesión del modo `auto`)
pierde un trozo **variable** del principio. En el peor caso el MP4 sale con un solo frame (261
bytes, solo la cabecera). Es el bug abierto «La grabación manual escribe un solo frame» del roadmap.

### Causa raíz

La salida `recording` **no tiene encoder propio**. En `ObsCapture.buildPipeline`
(`src/main/capture/obs.ts`), el replay buffer cuelga de ella (`replayBuffer.recording = recording`,
`usesStream = false`), así que las dos salidas usan el mismo `gameclip-venc`. Con `bufferMode:
always`, ese encoder lleva codificando desde que arrancó el buffer.

Cuando empieza la grabación, libobs engancha la salida nueva a un encoder que ya está a mitad de un
GOP. Una salida no puede empezar el MP4 con un frame que no sea keyframe, así que **descarta todo
hasta el siguiente keyframe**. No fijamos `keyint_sec`, así que el encoder usa su valor por defecto:
el log de NVENC dice `keyint: 250`, unos 4,2 s a 60 fps. Lo perdido es «lo que faltaba para el
siguiente keyframe», un valor al azar entre 0 y ~250 frames, más el arranque.

### Evidencia (verificada el 2026-10-08)

**1. Código de libobs** (`libobs/obs-output.c`, `interleave_packets`, OBS 31.1.3 según el log):

```c
/* if first video frame is not a keyframe, discard until received */
if (packet->type == OBS_ENCODER_VIDEO && !output->received_video[idx] && !packet->keyframe) {
    discard_unused_audio_packets(output, packet->dts_usec);
    return;
}
```

Y en `obs-encoder.c`, `obs_encoder_start_internal`: `first = (encoder->callbacks.num == 0)`; si el
encoder ya está activo la salida nueva solo añade un callback. Es exactamente lo que muestra el
log: al arrancar el buffer hay `obs_encoder_start_internal` + `add_connection`; al arrancar la
grabación solo `obs_encoder_start_internal`, sin `add_connection`.

**2. Código de obs-studio-node** (`osn-advanced-replay-buffer.cpp`): el buffer toma
`replayBuffer->recording->videoEncoder` y hace `obs_output_set_video_encoder` con él. No arranca la
grabación; solo le pide `UpdateEncoders()`. Por tanto, el encoder es compartido por construcción
y la grabación que se le cuelga al buffer puede ser **otra** `AdvancedRecording` que nunca se
arranque (base del fix).

**3. Los logs de hoy predicen la pérdida al frame.** Con 60 fps y `keyint: 250`, los keyframes caen
cada 250 frames desde que arranca el encoder. Pérdida esperada = frames hasta el siguiente keyframe
+ ~17 frames de latencia inherente (lookahead de 8 frames + B-frames; es lo que pierde el propio
replay buffer al arrancar: 17, 17 y 16 en los tres arranques registrados).

| Log | Encoder arranca | Grabación arranca | Frames transcurridos | Espera al keyframe | Predicho | Observado (drawn − output) |
|---|---|---|---|---|---|---|
| 19:27:36 | 4,735 s | 18,634 s | 834 | 1000 − 834 = 166 | 166 + 17 = **183** | 1317 − 1134 = **183** |
| 19:28:45 | 2,038 s | 30,776 s | 1724 | 1750 − 1724 = 26 | 26 + 17 = **43** | 179 − 135 = **44** |

**4. Por qué en julio salían «7 de 10 bien».** El selftest arranca la grabación justo después del
buffer. El primer paquete del encoder tarda ~10 frames en salir (lookahead + B-frames, ~170 ms a
60 fps). Si la grabación se engancha **antes** de ese primer paquete, su primer frame es el keyframe
inicial y no pierde nada; si se engancha después, espera 250 frames (4,17 s) y de una grabación de
~4,4 s quedan 1–13 frames. Es una carrera, no un fallo aleatorio del encoder, y explica tanto la
tasa como las dos severidades vistas.

**Descartado:**
- *«libobs no admite dos salidas con el mismo encoder y la segunda se queda sin frames»* (hipótesis
  del roadmap): libobs lo soporta explícitamente (es el modo «usar encoder del stream» de OBS) y
  hoy las grabaciones sacaron 1134 y 135 frames con el buffer activo.
- *Lag de codificación o de render:* ningún log tiene líneas de `lagged frames` ni `skipped frames`.
- *El aviso `Cannot apply a new video_t object while the encoder is active`:* lo emite
  `obs_encoder_set_video` cuando osn hace `obs_encoder_set_video_mix` al arrancar la grabación
  sobre el encoder ya activo. Es inocuo (el encoder ya tenía ese mismo vídeo) y sale en todas las
  ejecuciones, buenas y malas.
- *Audio:* se descarta junto al vídeo (`discard_unused_audio_packets`), así que el MP4 queda en
  sincronía; solo empieza tarde.

**Consecuencia real:** no es solo un fallo intermitente del selftest. **Toda grabación manual y todo
corte de sesión del modo `auto` empiezan entre 0 y 4,2 s tarde (≈2 s de media).** El MP4 de un
frame es el caso límite cuando la grabación dura menos que la espera.

Queda sin cuadrar al 100 % un detalle menor: el MP4 de 261 bytes con `Total frames output: 1` (el
contador cuenta el paquete entregado al muxer; el muxer no llegó a escribirlo). No afecta a la
causa.

Viene del diseño inicial de las salidas advanced (encoder compartido para no codificar dos veces).

## Alcance

**Dentro:**
- La salida `recording` tiene **su propio encoder de vídeo**, que solo codifica mientras se graba.
  Arranca con keyframe, así que la grabación empieza en el frame en que se pulsa.
- El replay buffer sigue con su encoder actual, sin cambios de comportamiento.
- Teardown: liberar los dos encoders y las dos salidas sin fugas.
- Test de regresión (rojo → verde) y una tanda de selftests que mida los frames perdidos antes y
  después.

**Fuera (explícito):**
- Cambiar el intervalo de keyframes del replay buffer (afecta a la precisión del inicio de los
  clips retroactivos; si interesa, va en su propia tarea).
- Los otros bugs abiertos (perfil de LoL por proceso, comprobación de píxeles, firma de obs64).
- Tocar el pipeline de audio o el remux de nombres de pista.

## Criterios de aceptación

- [x] En una tanda de **20 selftests** (`GAMECLIP_SELFTEST=recording`), ninguna grabación pierde más
      de lo que pierde el replay buffer al arrancar (≤ ~30 frames de `drawn − output`), y ninguna
      sale con 1 frame. La misma tanda **antes** del fix se mide y se anota para comparar.
- [x] El clip retroactivo sigue funcionando igual: guardar un clip con el buffer activo, durante una
      grabación y fuera de ella, produce un MP4 válido.
- [~] El modo `auto` (sesión completa) graba la sesión y guarda clips retroactivos a la vez. No probado E2E con juego real: `startSessionRecording` llama al mismo `obs.startRecording()` y en la prueba combinada el buffer guardó un clip con la grabación en curso.
- [x] Varios rebuilds seguidos (cambiar ajustes) no dejan encoders vivos («gameclip-venc 2»…) en el
      log de libobs.
- [x] El aviso `Cannot apply a new video_t object` deja de salir al empezar a grabar.
- [x] Test unitario: la grabación y el replay buffer **no comparten** encoder de vídeo.

## Resultados de la verificación (2026-10-08, máquina del owner, NVENC, 60 fps)

| Prueba | Antes del fix | Con el fix |
|---|---|---|
| Retardo 1 s antes de grabar | 177 frames perdidos (predicho 176) | 16 |
| Retardo 3 s antes de grabar | 83 (predicho 81) | 17 |
| 20 selftests sin retardo (carrera «buena») | 13–15 | — |
| 20 selftests con retardos 0–3,5 s | — | **14–18 en los 20**, 0 avisos `video_t` |
| 3 rebuilds + clip durante y tras la grabación | — | 4+4 encoders creados, 0 renumerados; 3 MP4 válidos |
| Audio (tono 440 Hz en bucle) | — | 3 pistas AAC, 8,03 s = 482 frames; tono en pistas 1 y 2 |

La pista 3 (micrófono) sale en silencio antes y después del fix: el id de micrófono guardado en los
ajustes no corresponde a ningún dispositivo de captura presente (NVIDIA Broadcast y MC20 sí lo están).
Es un ajuste del usuario, no parte de este fix.
