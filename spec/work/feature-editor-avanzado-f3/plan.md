# Plan — Editor avanzado (NLE) — Fase 3: cortes múltiples + undo/redo

> **Este plan es un contrato.** Cubre solo la **Fase 3**. Autoaprobado (acuerdo con el owner: me doy
> el OK del plan; la verificación E2E la hace el owner al final). Aprobado, el alcance queda fijo.

## Enfoque

Migrar el estado del recorte de `Trim { start, end }` (un rango) a `Segment[]` (varios rangos
conservados), en tiempo de origen. Toda la lógica es **pura y testeable** en `@shared/timeline`; la UI
y el render la consumen. El editor **simple** no se toca (usa su propio `start/end` y no importa este
modelo).

**1. Modelo de segmentos (`@shared/timeline`, puro).**
- `Segment { start, end }`; `initialSegments(duration)` → `[{0, duración}]`.
- `splitAt(segments, t)` — divide el segmento que contiene `t`; no divide si algún trozo quedaría por
  debajo de `MIN_TRIM_SECONDS`.
- `deleteSegment(segments, index)` — quita un segmento (nunca deja la lista vacía).
- `segmentAt(segments, t)` — índice del segmento que contiene `t`, o −1 (hueco/fuera).
- `keptDuration(segments)` — suma de longitudes (duración de la salida).
- `nextKeptTime(segments, t)` — para el ripple en reproducción: si `t` está en un segmento, `t`; si en
  un hueco, el inicio del siguiente; si pasó el final, `null`.
- `setSegmentsStart/End(segments, value, duration)` — recorte de bordes = mover el borde del
  primer/último segmento (reemplaza a `setTrimStart/End`, que se retiran junto con el tipo `Trim`).

**2. Render por segmentos (`main/export/ffmpeg-args`).**
`FfmpegJob` gana `segments?: Segment[]`. `buildFfmpegArgs`:
- **1 segmento (o ausente):** ruta actual `-ss/-t` intacta (rápida, seek por input).
- **≥2 segmentos:** `filter_complex` **sin** seek de input:
  - Vídeo: por segmento `i`, `[0:v]trim=start=Si:end=Ei,setpts=PTS-STARTPTS[vi]`.
  - Audio: se arma la mezcla completa (`gainMixFilter` de Fase 1/2) en `[mixfull]`, se **duplica** con
    `asplit=N` y cada copia se `atrim`+`asetpts` por segmento → `[ai]`.
  - `[v0][a0]…[v{N-1}][a{N-1}]concat=n=N:v=1:a=1[vout][aout]`; map `[vout]`/`[aout]`. Sin audio activo
    (ganancias 0) → concat solo vídeo (`a=0`) y `-an`.
  - Códec de vídeo idéntico al MP4 actual (libx264 veryfast + crf por calidad + faststart).
- Progreso: `ExportManager.run` calcula la duración con `keptDuration(job.segments)` cuando hay
  segmentos (si no, `endSeconds - startSeconds`, como hoy).

**3. IPC / export (`@shared/export`, `main/ipc`).**
`ExportRequest` gana `segments?: Segment[]` (+ normalización: rangos válidos, ordenados, dentro de
`[0, ...]`, mínimo `EXPORT_MIN_SECONDS` de duración conservada). El editor **simple** sigue mandando
`start/end` (sin segmentos → un rango). En `ExportRun`, el job recibe `segments` (o `[{start,end}]` si
no vienen) y `startSeconds/endSeconds` derivados del primer/último (para la ruta simple).

**4. Estado del editor (`EditorAvanzado.tsx`).**
- `segments: Segment[]` reemplaza a `trim`; `selectedSegment: number | null`.
- **Historial** para undo/redo: `past: Segment[][]`, `future: Segment[][]`. `commit(next)` empuja el
  actual a `past`, fija `segments`, vacía `future`. `undo`/`redo` mueven entre pilas. Los cambios de
  **volumen/eliminar pista no** entran en el historial (solo cortes). El arrastre de bordes commitea
  **al soltar** (un solo paso de historial por arrastre), no en cada `pointermove`.
- **Dividir** (botón + tecla `S`): `commit(splitAt(segments, playhead))`.
- **Borrar** (botón/basurero + `Supr`): `commit(deleteSegment(segments, selectedSegment))`.
- **Ripple en reproducción:** en el `rAF` que ya mueve el playhead, si `segmentAt(playhead) < 0` →
  `nextKeptTime`; si `null`, `stop()`; si un tiempo, `seek()` a él (el motor de audio de Fase 2 salta
  con el mismo `seek`).
- **Render:** manda `segments` en el `ExportRequest` (además de los `trackVolumes` de Fase 1/2).
- Atajos: `Ctrl+Z` deshacer, `Ctrl+Y`/`Ctrl+Shift+Z` rehacer, `S` dividir, `Supr` borrar (listener de
  teclado del editor; se desmonta al salir).

**5. Timeline UI (`components/editor-avanzado`).**
- Nueva **barra de cortes** (`SegmentBar`) bajo la regla: dibuja los segmentos como bloques
  (`secondsToPx`), el seleccionado resaltado; clic selecciona; los huecos quedan vacíos.
- Los **huecos borrados** se atenúan sobre las pistas: se generaliza `.eav-trim-shade` a "zonas fuera
  de lo conservado" (antes/después de los bordes **y** entre segmentos).
- Las asas de recorte (inicio/fin) siguen, ahora sobre el primer/último segmento.
- La barra de herramientas suma: Dividir, Borrar segmento, Deshacer, Rehacer (con `disabled` según
  estado).

## Archivos / módulos afectados (Fase 3)

- `src/shared/timeline.ts` — modelo `Segment` + funciones puras; retira `Trim`/`setTrimStart/End`.
- `src/shared/__tests__/timeline.test.ts` — tests del modelo de segmentos (sustituyen a los de `Trim`).
- `src/main/export/ffmpeg-args.ts` — `segments` en `FfmpegJob` + ruta `concat` (`buildConcatArgs`).
- `src/main/__tests__/ffmpeg-args.test.ts` — tests del concat (2+ segmentos, con/sin audio) + que 1
  segmento mantiene `-ss/-t`.
- `src/main/export/manager.ts` — duración de progreso por `keptDuration` cuando hay segmentos.
- `src/shared/export.ts` — `ExportRequest.segments` + normalización. Tests en `export.test.ts`.
- `src/main/ipc.ts` — `ExportRun` pasa `segments` al job.
- `src/renderer/views/EditorAvanzado.tsx` — estado de segmentos, historial undo/redo, dividir/borrar,
  ripple en reproducción, atajos, render con segmentos.
- `src/renderer/components/editor-avanzado/Timeline.tsx` — huecos atenuados; asas sobre primer/último.
- `src/renderer/components/editor-avanzado/SegmentBar.tsx` *(nuevo)* — barra de cortes seleccionable.
- `src/renderer/styles.css` — estilos de la barra de cortes y de los huecos.
- `src/renderer/__tests__/editor-avanzado.test.tsx` — dividir/borrar/undo/redo y render con segmentos.

## Decisiones y alternativas consideradas

- **Timeline en tiempo de origen con huecos (no vista compactada).** El `<video>` reproduce tiempo de
  origen; mostrar la salida compactada obligaría a mapear tiempo-salida↔tiempo-origen en cada frame y
  a un scrubbing antinatural. El ripple se ve **en la reproducción** (salta huecos) y en el render
  (concat), que es lo que el usuario necesita, con mucho menos riesgo.
- **`concat` por `filter_complex` en una sola pasada.** Alternativa descartada — extraer cada segmento
  a un archivo y unir con el demuxer `concat`: más E/S temporal, y re-mezclar el audio por pista por
  segmento se complica. El filtergraph lo hace en una pasada y reutiliza `gainMixFilter` (Fase 1/2).
- **Ruta rápida `-ss/-t` para 1 segmento.** El caso común (recorte simple sin cortes interiores) no
  paga el coste de decodificar todo el clip que impone el `trim` de filtro.
- **Historial solo de cortes.** El volumen cambia de forma continua (rueda); meterlo en el historial lo
  inundaría. Deshacer/rehacer se acota a operaciones **discretas** de corte (incluye el arrastre de
  bordes, que commitea al soltar).
- **`asplit` de la mezcla.** Una salida de filtro se consume una sola vez; para trocear la mezcla por
  segmento hay que duplicarla con `asplit=N` antes de los `atrim`.
- **Sin bump de versión.** La app sigue en `0.8.0`; se publica al terminar las cinco fases.

## Riesgos

- **Filtergraph de concat.** Es la pieza con más partes móviles (etiquetas, `asplit`, `atrim`,
  `concat`). Mitigado: construcción pura y **testeada** (args exactos) + verificación headless de un
  render real de 2 segmentos antes de entregar.
- **Coste del `trim` de filtro** (decodifica todo el clip, sin seek de input). Asumido para clips de
  edición; la ruta rápida cubre el caso de 1 segmento.
- **Sincronía del salto de hueco** en reproducción: el salto es un `seek`, que el motor de audio de
  Fase 2 ya maneja (re-arranca las fuentes). Umbral y re-sync ya existen.
- **Undo/redo y arrastre de bordes:** hay que commitear al soltar, no en cada movimiento, para no
  llenar el historial. Se captura el estado al empezar el arrastre.
- **Migración de `Trim`:** solo lo usa el editor avanzado (verificado); el simple no se ve afectado.

---

**Estado:** ✅ aprobado (autoaprobado) el 2026-07-14
