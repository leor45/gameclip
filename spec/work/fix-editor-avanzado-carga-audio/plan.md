# Plan — Editor avanzado: carga del audio (volumen, ■ y ▶ desde un hueco)

> **Este plan es un contrato.** Diseño aprobado por el owner antes de implementar.

## Enfoque

1. **Bug 2.** `volumesRef` y `removedRef`, asignadas en cada render junto a `segmentsRef`.
   `ensureAudioLoaded` lee `volumesRef.current`/`removedRef.current` en el bucle de después del
   `await`. `setGain`/`toggleRemove` no cambian: sobre el motor ya funcionan (ver «Conclusión sobre
   `live-audio.ts`»).
2. **Bug 3.** `playAttemptRef` (contador). `togglePlay`, rama de reproducir: `const intento =
   ++playAttemptRef.current` antes del `await ensureAudioLoaded()`; tras él,
   `if (videoRef.current !== v || playAttemptRef.current !== intento) return;`. `stop()` incrementa el
   contador. Un segundo ▶ que llegara durante la carga (hoy imposible: ▶ se deshabilita) invalidaría el
   primero y solo arrancaría el último sobre la misma carga (`load` deduplica con `loadingPromise`).
3. **Bug 4.** Se generaliza el `reinicio` de D6-BUG-2 a `salto`: si `segmentAt(segs, t) < 0`, el
   destino es `nextKeptTime(segs, t) ?? segs[0].start`; se fija `skipTargetRef.current = destino`,
   `v.currentTime = destino` y `setPlayhead(destino)` **antes** de `v.play()`, y no se llama a
   `engine.play`: lo arranca el bucle al aterrizar (`!v.seeking`), como en el salto de huecos.

## Archivos / módulos afectados

- `src/renderer/views/EditorAvanzado.tsx` — refs nuevas, `ensureAudioLoaded`, `togglePlay`, `stop`.
- `src/renderer/__tests__/editor-avanzado.test.tsx` — tests nuevos; el `AudioContext` falso registra la
  ganancia de cada pista y el `<video>` simulado, desde dónde se llamó a `play()`; un test existente
  cambia de expectativa (ver «Desviaciones»).

## Decisiones y alternativas consideradas

- **Conclusión sobre `live-audio.ts` (Bug 2).** `load()` crea los `GainNode` de forma síncrona al
  llamarse (el cuerpo del `map` async corre hasta su primer `await`) y `setGain()` actúa sobre ellos
  en cuanto existen; antes de `load()` solo guarda `targetGains`, que `load` usa al crear el nodo. Es
  decir, `setGain`/`toggleRemove` **no se ignoran** durante la carga: el único problema era la
  reaplicación del closure viejo. Leer los refs tras el `await` la deja idempotente con lo ya
  aplicado.
- **Refs frente a quitar la reaplicación de `ensureAudioLoaded`:** se conserva el bucle de después de
  la carga (un único punto que deja el motor consistente con la UI antes de sonar, también en los
  ▶ siguientes y con el estado restaurado de un borrador) y se alimenta con datos vivos; así deja de
  pisar nada y no cambia el resto del flujo.
- **Refs asignadas en el render** (como `segmentsRef`): el `setState` de un evento discreto se
  renderiza de forma síncrona al acabar el evento, así que cuando la carga del audio (asíncrona, de
  otro turno) termina, el ref ya tiene el último valor.
- **Contador (`playAttemptRef`) frente a un booleano «cancelado»:** el contador distingue intentos
  consecutivos (▶ ■ ▶ durante una carga) y no requiere resetear nada.
- **Destino del salto = inicio del tramo.** `segmentAt` usa `start ≤ t < end`, así que `t = start`
  cuenta como dentro: tras aterrizar el bucle no vuelve a saltar. Si el navegador asienta el vídeo
  unos milisegundos antes del destino, `skipTargetRef === next` impide re-emitir el seek (mismo
  comportamiento que el salto de huecos ya probado).
- **Sin audio en vivo** (`live === false`): se fija `currentTime = destino` antes de `play()`, así que
  el navegador empieza a reproducir tras el seek, no desde el hueco.
- **Camino del bucle sin cambios.** No se toca el rAF; solo cambia desde dónde parte el vídeo.

## Riesgos

- Vídeo que no termina de buscar (archivo roto): el audio en vivo del salto no arranca, igual que la
  imagen (mismo riesgo que el reinicio de D6-BUG-2).
- ❚❚ en mitad de un salto de ▶ deja `skipTargetRef` pendiente (ya pasaba con el salto de huecos y el
  reinicio); al reanudar, el audio puede arrancar dos veces en el mismo punto (benigno).
- Un ▶ cuando el cursor está justo en el borde final de un tramo (`t = end`) ahora salta de inmediato
  al siguiente tramo en vez de arrancar y saltar un tick después: es el efecto buscado.

## Desviaciones

- El test existente «en un hueco con tramos después, ▶ no vuelve al primero: el bucle salta el hueco
  como siempre» fijaba el comportamiento antiguo (el seek lo hacía el primer tick). Pasa a esperar el
  seek en el propio clic (Bug 4) y que el bucle no vuelva a reposicionar.

---

**Estado:** ✅ aprobado (diseño del owner)
