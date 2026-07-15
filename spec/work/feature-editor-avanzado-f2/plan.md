# Plan — Editor avanzado (NLE) — Fase 2: audio en vivo por pista

> **Este plan es un contrato.** Cubre solo la **Fase 2**. Se autoaprueba (acuerdo con el owner:
> me doy el OK del plan; la verificación E2E la hace el owner al final).
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Reconstruir la mezcla **en vivo** en el renderer con la **Web Audio API**, colgada del reloj del
`<video>` (fuente de verdad del tiempo, fijada en Fase 1). El `<video>` se pone **mudo** (`muted`) y
el audio lo produce un grafo Web Audio: **una pista → un `GainNode` → un `masterGain` → destino**. La
onda ya se extrae por pista en el main; ahora extraemos también el **audio real** por pista.

**1. Extracción de audio por pista (main + ffmpeg).**
Análogo a `waveform.ts`, pero volcando la pista a un contenedor que `decodeAudioData` decodifique. Se
usa **AAC/ADTS** (`-map 0:a:N -c:a aac -f adts pipe:1`): es *streamable* por stdout (a diferencia de
MP4, que necesita salida seekable para el `moov`) y Chromium/Electron ya decodifica AAC (los clips son
H.264+AAC y ya se reproducen). Nuevo módulo `src/main/export/track-audio.ts`:
- `trackAudioArgs(inputPath, trackIndex)` — args puros (testeable).
- `extractTrackAudio(spawnFn, ffmpegPath, inputPath, trackIndex)` → `Promise<Buffer>` (best-effort:
  `Buffer` vacío si falla, igual patrón que `extractWaveform`).
`ExportManager.trackAudio(file, trackIndex)` lo expone (reusa `probeTracks`/`selectableTracks` para
validar el índice). Devuelve los **bytes** de esa pista.

**2. IPC / preload.**
Nuevo canal `ClipGetTrackAudio` → `{ id, trackIndex } ⇒ ArrayBuffer` (bytes AAC de la pista; vacío si
no se pudo). Contrato en `@shared/ipc`, handler en `main/ipc.ts` (resuelve el clip y llama a
`exp.trackAudio`), y `preload` expone `editor.getTrackAudio(id, trackIndex)`. Se transfiere el
`ArrayBuffer` tal cual (structured clone lo soporta por IPC).

**3. Motor de audio en vivo (renderer).**
Nuevo `src/renderer/lib/live-audio.ts`: una clase `LivePreviewAudio` que encapsula el grafo y la
sincronía. Diseño:
- **Carga perezosa:** `load(getBuffer)` se llama en el **primer play**; por cada pista pide sus bytes
  (`editor.getTrackAudio`) y `audioContext.decodeAudioData` → un `AudioBuffer` por `key`. En paralelo,
  best-effort (una pista sin buffer no suena, pero no rompe).
- **Reproducción:** `play(fromSeconds)` crea un `AudioBufferSourceNode` por pista y lo arranca en
  `ctx.currentTime` con `offset = fromSeconds`; guarda el anclaje `{ ctxStart, mediaStart }` para
  medir la deriva. `pause()`/`stop()` paran y descartan los sources (los `BufferSource` son de un
  solo uso).
- **Volumen en vivo:** `setGain(key, gain)` → `gainNode.gain.value = gain` (sin reiniciar). Eliminar =
  gain 0. El `masterGain` queda para un posible mute global.
- **Seek:** `seek(seconds)` — si está sonando, re-arranca los sources en el nuevo offset; si está en
  pausa, solo recuerda la posición.
- **Sincronía / deriva:** el `<video>` manda. En el `rAF` que ya mueve el playhead, se compara el
  tiempo del audio (`ctx.currentTime - ctxStart + mediaStart`) con `video.currentTime`; si
  `|Δ| > UMBRAL` (~150 ms), se re-sincroniza (`seek(video.currentTime)`). La **decisión** de
  re-sync es una función pura `shouldResync(audioTime, videoTime, threshold)` (testeable); el umbral
  generoso evita reinicios audibles cuando los relojes están cerca.
- **Degradación:** si `window.AudioContext` no existe (jsdom en tests, o entorno raro), la clase es un
  **no-op** silencioso (todos los métodos guardan y salen). Igual patrón que el guard de `getContext`
  en `Waveform`.
- Limpieza: `dispose()` para/cierra el `AudioContext` al desmontar.

**4. Integración en `EditorAvanzado.tsx`.**
- El `<video>` pasa a `muted` (el audio real lo pone el motor).
- Se instancia el motor (ref) y se sincroniza con el estado existente:
  - `togglePlay`: en el primer play, `await engine.load(...)` (con un flag `audioLoading` para
    feedback); luego `engine.play(video.currentTime)` junto al `video.play()`.
  - `stop`: `engine.stop()`.
  - `seek`: `engine.seek(s)`.
  - Cambios de volumen (`setGain`) y de eliminado (`toggleRemove`): `engine.setGain(key, gainEfectiva)`.
  - En el `rAF` de reproducción: además de mover el playhead, corrección de deriva.
  - `useEffect` de limpieza: `engine.dispose()`.
- La ganancia efectiva por pista (removed → 0, si no `trackGain(volumes, key)`) ya se calcula para el
  render; se centraliza para que **preview y render usen exactamente la misma** (garantiza el criterio
  "lo que oyes = lo que se renderiza").

## Archivos / módulos afectados (Fase 2)

- `src/main/export/track-audio.ts` *(nuevo)* — extracción de una pista a AAC/ADTS. Puro + spawn
  inyectable. Tests.
- `src/main/export/manager.ts` — `trackAudio(file, trackIndex)` (valida índice con `selectableTracks`).
- `src/shared/ipc.ts` — canal `ClipGetTrackAudio` + contrato + `EditorApi.getTrackAudio`.
- `src/main/ipc.ts` — handler de `ClipGetTrackAudio`.
- `src/preload/index.ts` — expone `editor.getTrackAudio`.
- `src/renderer/lib/live-audio.ts` *(nuevo)* — motor Web Audio + helpers puros (`shouldResync`, mapeo
  de ganancia). Tests de lo puro y del no-op sin `AudioContext`.
- `src/renderer/views/EditorAvanzado.tsx` — `<video muted>`, cableado del motor a play/pausa/stop/seek,
  volumen/eliminado en vivo, corrección de deriva, `dispose` al desmontar.
- `src/renderer/__tests__/setup.ts` — mock `editor.getTrackAudio` (→ `ArrayBuffer` vacío).
- Tests: `track-audio.test.ts` *(nuevo)*, `live-audio.test.ts` *(nuevo)*, y el test de
  `EditorAvanzado` sigue verde (motor no-op sin `AudioContext`).

## Decisiones y alternativas consideradas

- **Web Audio con `AudioBuffer` por pista, `<video>` mudo.** Es la única forma de oír las pistas por
  rol (el navegador solo decodifica la mezcla `default`) y de aplicar ganancia **> 100 %** (un
  `<video>`/`<audio>` topa en 1.0; un `GainNode` no). Reconstrucción idéntica a la del render.
  - *Alternativa descartada — varios `<audio>` sincronizados:* la sincronía entre elementos media es
    notoriamente inestable (drift, `currentTime` con granularidad de buffer); Web Audio da arranque
    sample-accurate.
  - *Alternativa descartada — `MediaElementSource` del `<video>` para el clip de una sola pista:* daría
    sync perfecto sin extraer, pero parte el código en dos caminos. Se prefiere un **único** camino
    (extraer + mezclar) para todas las pistas mostradas; el coste extra en el caso de 1 pista es
    asumible y el modelo mental es uno solo ("reconstruyo desde las desglosadas").
- **`<video>` como reloj maestro (mudo) + re-sync por umbral.** Respeta el diseño de Fase 1 (el vídeo
  es la fuente de verdad del tiempo) y evita mover `video.currentTime` cada frame (causa stutter).
  La deriva entre el reloj del `AudioContext` y el del media element se corrige puntualmente.
  - *Alternativa descartada — audio como reloj maestro:* obligaría a empujar `video.currentTime` y a
    pelear con el buffering del vídeo; peor imagen por mejor sync que el editor no necesita.
- **AAC/ADTS por stdout.** *Streamable* (MP4 no lo es sin salida seekable) y ya decodificable en
  Electron. *Alternativa — WAV:* decodificación garantizada pero pesa ~10× (23 MB/2 min); AAC baja a
  ~2 MB. Si algún clip raro no decodificara en AAC, se degrada (esa pista no suena) sin romper.
- **Carga perezosa en el primer play.** Abrir el editor no debe pagar N extracciones de ffmpeg si el
  usuario no reproduce; la onda (barata, 8 kHz mono) sí se carga al abrir, el audio completo no.
- **Sin bump de versión.** La app sigue en `0.8.0`; el editor avanzado se publica una sola vez al
  terminar las cinco fases (acuerdo con el owner).

## Riesgos

- **Sincronía audio/vídeo (labial).** El mayor riesgo. Mitigado: re-sync en cada seek/play y corrección
  por deriva con umbral. Para clips cortos (el caso típico) la deriva es mínima. Si molestara, el umbral
  se ajusta.
- **Memoria.** Decodificar el audio completo por pista a `AudioBuffer` (float32). ~11 MB/pista/min a
  48 kHz estéreo; para clips de segundos–minutos es asumible en un editor de escritorio. Se documenta;
  carga perezosa y `dispose` al salir acotan el pico.
- **`decodeAudioData` y el códec.** Se apoya en el AAC de Electron (ya usado para reproducir los MP4).
  Best-effort por pista: un fallo de decodificación deja esa pista muda, no rompe el editor.
- **Web Audio en jsdom.** No existe `AudioContext`; el motor es no-op y los tests montan el editor sin
  audio. Cubierto explícitamente por un test.
- **Autoplay/gesto de usuario.** El `AudioContext` puede nacer `suspended`; se hace `resume()` dentro
  del handler de play (que es un gesto de usuario), así que no lo bloquea la política de autoplay.

---

**Estado:** ✅ aprobado (autoaprobado) el 2026-07-14
