# Tasks — Editor avanzado (NLE) — Fase 3: cortes múltiples + undo/redo

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## A. Modelo puro (`@shared/timeline`)

- [x] 1. Tipo `Segment` + `initialSegments`, `splitAt`, `deleteSegment`, `segmentAt`, `keptDuration`,
      `nextKeptTime`, `setSegmentsStart/End`. Retirar `Trim`/`setTrimStart/End`. Tests que sustituyen
      a los de `Trim` (dividir, borrar deja ≥1, huecos, siguiente tiempo, bordes).

## B. Render por segmentos (main)

- [x] 2. `ffmpeg-args`: `segments?` en `FfmpegJob` + `buildConcatArgs` (vídeo `trim`+`setpts`, audio
      `gainMixFilter`→`asplit`→`atrim`, `concat`; sin audio → `-an`). 1 segmento mantiene `-ss/-t`.
- [x] 3. `manager`: duración de progreso por `keptDuration(job.segments)` cuando hay segmentos.

## C. IPC / export

- [x] 4. `@shared/export`: `ExportRequest.segments` + normalización (rangos válidos, ordenados, mínimo).
- [x] 5. `main/ipc`: `ExportRun` pasa `segments` al job (deriva `start/end` del primero/último).

## D. UI del editor

- [x] 6. `SegmentBar.tsx` *(nuevo)*: bloques de segmentos, selección por clic, seleccionado resaltado.
- [x] 7. `Timeline.tsx`: huecos atenuados (zonas fuera de lo conservado); asas sobre primer/último
      segmento.
- [x] 8. `EditorAvanzado.tsx`: estado `segments` + `selectedSegment`; historial undo/redo (commit por
      corte; arrastre de bordes commitea al soltar) en un reducer puro (`editor-avanzado-edit.ts`);
      dividir/borrar; ripple en reproducción; atajos (`Ctrl+Z`/`Ctrl+Y`/`Ctrl+Shift+Z`, `S`, `Supr`);
      render con `segments`.
- [x] 9. `styles.css`: barra de cortes y huecos.

## Tests unitarios (obligatorios)

- [x] Modelo de segmentos: dividir (y no dividir bajo el mínimo), borrar (deja ≥1), `keptDuration`,
      `nextKeptTime` (dentro/hueco/pasado el final), bordes.
- [x] `ffmpeg-args`: 1 segmento = `-ss/-t`; 2+ = concat con/sin audio (etiquetas `asplit`/`atrim`/
      `concat` correctas).
- [x] `export`: normalización de `segments` (válidos/ordenados/mínimo).
- [x] Reducer de edición (`editor-avanzado-edit`): commit/undo/redo/arrastre.
- [x] `EditorAvanzado`: dividir + borrar cambia los segmentos; undo/redo; render manda `segments`.

## Verificación (gates)

- [x] Type-check · lint · tests verdes (674).
- [x] Comprobación propia: **render real de 2 segmentos** (headless con el ffmpeg de osn) → MP4 de
      **7.00 s** (3+4) con vídeo H.264 + audio AAC. Filtergraph válido. Visual del segbar/huecos revisado.

## Cierre

- [x] **Detenerse** — el owner probó E2E (dividir, borrar del medio, reproducir con saltos, render,
      undo/redo) y dio el OK. Durante la E2E se añadió el ripple (auto-cerrar hueco), el fix del salto
      de hueco (una sola vez) y el fix del audio "doble" en el corte (silencio durante el seek).
- [x] Merge a `main` con `--no-ff` y rama borrada (sin release; el 0.8.0 se publica al final).
- [x] `spec/constitution/roadmap.md` actualizado.
