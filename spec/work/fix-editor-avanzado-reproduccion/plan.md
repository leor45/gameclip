# Plan — Editor avanzado: salir mientras carga el audio y ▶ tras el final recortado

> **Este plan es un contrato.** Aprobado con el resto de la tanda D.

## Enfoque

1. `togglePlay`, justo después de `await ensureAudioLoaded()`: `if (videoRef.current !== v) return;`.
   React 18 pone a null la ref de un elemento al desmontarlo, así que sirve de «sigue montado» sin
   una ref extra, y cubre también que el `<video>` haya desaparecido sin desmontar el editor (vista
   «Ese clip ya no está disponible»). Después del guard no se toca nada; antes solo corren
   `setAudioLoading(false)` (no-op tras desmontar en React 18) y `setGain` sobre el motor ya liberado
   (sin nodos: no hace nada).
2. `togglePlay`, tras el guard, con los segmentos vivos (`segmentsRef`, no los del render del clic:
   pueden cambiar durante la carga) y el `v.currentTime` de ese momento (la timeline puede moverlo
   durante la carga): si `segs.length > 0 && segmentAt(segs, t) < 0 && nextKeptTime(segs, t) === null`,
   se fija `skipTargetRef = inicio`, `v.currentTime = inicio` y `setPlayhead(inicio)`, con
   `inicio = segs[0].start`, y no se llama a `engine.play`: lo hace el bucle en su rama de
   «aterrizaje» cuando `!v.seeking`. Fuera de ese caso, `togglePlay` sigue igual.
3. `stop()`: `skipTargetRef.current = null`.

## Archivos / módulos afectados

- `src/renderer/views/EditorAvanzado.tsx` — `togglePlay` y `stop`.
- `src/renderer/__tests__/editor-avanzado.test.tsx` — 9 tests nuevos (AudioContext falso para activar
  el motor en jsdom, rAF manual para correr el bucle tick a tick y `<video>` simulado).

## Decisiones y alternativas consideradas

- **Guard con `videoRef`** frente a una ref de «montado»: React ya suelta la ref al desmontar; otra
  ref duplicaría ese estado. El test de regresión lo cubre (con el guard pasa a verde).
- **El audio del reinicio lo arranca el bucle al aterrizar** (vía `skipTargetRef`) frente a
  `engine.play(inicio)` inmediato: el seek del `<video>` tarda ~100-300 ms; con el audio ya sonando,
  se adelanta a la imagen y el resync (>150 ms) lo devuelve atrás → se oye «doble», justo lo que el
  salto de huecos evita. Reutilizar ese mecanismo da el mismo comportamiento ya probado.
- **■ anula el salto pendiente:** lo exige la decisión anterior. Sin esa línea, ▶ (reinicio) → ■ antes
  de aterrizar → ▶ deja `skipTargetRef` igual al salto que el bucle necesita y no lo re-emite: suena
  y se ve el principio recortado (test en rojo sin ella). El mismo fallo ya existía con el salto del
  principio recortado y queda cubierto también. Es seguro: tras ■ el bucle está parado y el
  siguiente ▶ parte de cero.
- **❚❚ no se toca:** también deja el salto pendiente, pero el vídeo aterriza igual en el destino
  (pausado) y al reanudar el bucle solo re-arranca el audio en el mismo punto un fotograma después
  (benigno; ya pasa con el salto de huecos). Limpiarlo en ❚❚ cambiaría reanudar en mitad del seek
  (el audio podría quedar adelantado hasta 150 ms sin re-sync).
- **El reinicio también vale para un clip sin recortar** parado justo en el final, o si la duración
  del catálogo es algo menor que la del vídeo (el bucle para antes de `ended` y ▶ quedaba igual de
  muerto): mismo resultado que el reinicio del navegador.
- **Caminos que arrancan la reproducción:** solo `togglePlay` (el botón ▶, también con Espacio/Enter
  sobre el botón). El editor avanzado no tiene atajo de teclado para reproducir.
- **Doble ▶ durante la carga:** no es posible; `audioLoading` se fija en el mismo gesto, antes del
  primer `await`, y deshabilita ▶. Fuera de la carga la continuación corre en microtareas antes de
  cualquier otro evento. El cambio no añade ningún `await`.

## Riesgos

- Un vídeo que no termina de buscar (archivo roto): el audio en vivo del reinicio no arranca, igual
  que la imagen.
- Tras ■, un ▶ inmediato (antes de que el vídeo vuelva a 0) arranca el audio en el acto, como ya
  pasaba tras ■ sin salto en curso.
- **Hallazgo aparte, no corregido** (pre-existente, fuera de alcance): `ensureAudioLoaded` aplica al
  terminar la carga los volúmenes y pistas quitadas del render del clic. Si se cambian durante
  «Cargando audio…», el motor vuelve a los de antes (el slider marca 30 % y suena al 100 %) hasta
  tocarlo otra vez. Lleva su propio fix.

---

**Estado:** ✅ aprobado el 2026-10-09
