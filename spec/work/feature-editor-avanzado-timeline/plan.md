# Plan — Editor avanzado: timeline por trozos (tipo DaVinci)

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

1. **Modelo (`src/shared/timeline.ts`, puro):** `trimSegmentEdge(segments, index, side, value,
   duration)` acota el borde a `[fin del anterior, fin − MÍN]` (inicio) o `[inicio + MÍN, inicio del
   siguiente]` (fin), con `0` y `duration` en los extremos. Tests primero.
2. **Fotogramas:** `Filmstrip` pasa a muestrear de forma uniforme sobre **todo el origen** (no sobre la
   salida) y expone `useFilmstripFrames(clipId, duration)`; `FilmstripBlock` dibuja en un bloque los
   fotogramas cuyo tiempo cae en su tramo, posicionados por tiempo de origen. La caché por clip sigue
   siendo la misma (el editor básico ya muestreaba el clip entero).
3. **Timeline (`Timeline.tsx`):** dos columnas, cabeceras fijas a la izquierda y pistas con scroll a la
   derecha. Recibe las pistas como datos (`lanes`: clave, cabecera, alto, contenido de un bloque,
   rueda, atenuada) y pinta, por pista, un bloque por segmento con el mismo `left/width`. Las asas de
   cada bloque (en la pista de vídeo, accesibles con `role="slider"`; en las de audio, solo ratón)
   recortan ese trozo con delta y escala congelada (como el arrastre actual). Regla y clic en vacío
   mueven el cabezal; clic en un bloque lo selecciona y lleva el cabezal ahí.
4. **Cabeceras:** `AudioTrackRow` se divide en `AudioTrackHead` (icono por rol, nombre, deslizador,
   %, quitar/restaurar) y el contenido del bloque (`Waveform` con `segments={[trozo]}`, que ya dibuja
   un tramo concreto). Etiquetas accesibles intactas («Volumen de X», «Eliminar X», «Restaurar X»).
5. **`EditorAvanzado.tsx`:** construye las `lanes`, conecta `trimSegmentEdge` con `beginDrag/live/
   endDrag` del reducer (un paso de deshacer por arrastre), iconos SVG en la barra.
6. **CSS (`editor.css`):** bloques, huecos, selección amarilla, asas, columna de cabeceras, transición
   de recolocación (`left/width`, 160 ms; nada con «reducir movimiento» ni durante el arrastre).

## Archivos / módulos afectados

- `src/shared/timeline.ts` (+ tests).
- `src/renderer/components/editor-avanzado/{Timeline,Filmstrip,AudioTrackRow,SegmentBar}.tsx`
  (SegmentBar se retira: los bloques son la barra de cortes).
- `src/renderer/views/EditorAvanzado.tsx`, `src/renderer/styles/editor.css`.
- Tests del editor avanzado y del filmstrip.

## Decisiones y alternativas consideradas

- **Audio ligado al vídeo por trozo** (como un clip enlazado de DaVinci): el modelo actual de
  segmentos es único para todas las pistas; separar audio y vídeo sería otro modelo y otro render.
- **Muestrear la tira sobre el origen** y no sobre la salida: así cada bloque tiene sus fotogramas sin
  volver a extraer al cortar o recortar.
- **Asas por bloque en lugar de asas globales:** las globales eran el borde del primer y del último
  trozo; las nuevas las incluyen.

## Riesgos

- **Tests del editor avanzado** que buscan las asas globales o la barra de segmentos: se adaptan
  manteniendo lo que comprueban.
- **Rendimiento con muchos cortes:** un lienzo de onda por bloque y pista; acotado (los clips son
  cortos y los cortes, pocos).
- **Arrastre cerca del vecino:** el borde se acota al vecino; nunca solapan.

---

**Estado:** ✅ aprobado el 2026-10-09 (el owner aprobó la maqueta: «Adelante, procede»)
