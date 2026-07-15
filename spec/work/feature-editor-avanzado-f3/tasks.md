# Tasks — Editor avanzado (NLE) — Fase 3: cortes múltiples + undo/redo

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## A. Modelo puro (`@shared/timeline`)

- [ ] 1. Tipo `Segment` + `initialSegments`, `splitAt`, `deleteSegment`, `segmentAt`, `keptDuration`,
      `nextKeptTime`, `setSegmentsStart/End`. Retirar `Trim`/`setTrimStart/End`. Tests que sustituyen
      a los de `Trim` (dividir, borrar deja ≥1, huecos, siguiente tiempo, bordes).

## B. Render por segmentos (main)

- [ ] 2. `ffmpeg-args`: `segments?` en `FfmpegJob` + `buildConcatArgs` (vídeo `trim`+`setpts`, audio
      `gainMixFilter`→`asplit`→`atrim`, `concat`; sin audio → `-an`). 1 segmento mantiene `-ss/-t`.
- [ ] 3. `manager`: duración de progreso por `keptDuration(job.segments)` cuando hay segmentos.

## C. IPC / export

- [ ] 4. `@shared/export`: `ExportRequest.segments` + normalización (rangos válidos, ordenados, mínimo).
- [ ] 5. `main/ipc`: `ExportRun` pasa `segments` al job (deriva `start/end` del primero/último).

## D. UI del editor

- [ ] 6. `SegmentBar.tsx` *(nuevo)*: bloques de segmentos, selección por clic, seleccionado resaltado.
- [ ] 7. `Timeline.tsx`: huecos atenuados (zonas fuera de lo conservado); asas sobre primer/último
      segmento.
- [ ] 8. `EditorAvanzado.tsx`: estado `segments` + `selectedSegment`; historial undo/redo (commit por
      corte; arrastre de bordes commitea al soltar); dividir/borrar; ripple en reproducción; atajos
      (`Ctrl+Z`/`Ctrl+Y`/`Ctrl+Shift+Z`, `S`, `Supr`); render con `segments`.
- [ ] 9. `styles.css`: barra de cortes y huecos.

## Tests unitarios (obligatorios)

- [ ] Modelo de segmentos: dividir (y no dividir bajo el mínimo), borrar (deja ≥1), `keptDuration`,
      `nextKeptTime` (dentro/hueco/pasado el final), bordes.
- [ ] `ffmpeg-args`: 1 segmento = `-ss/-t`; 2+ = concat con/sin audio (etiquetas `asplit`/`atrim`/
      `concat` correctas).
- [ ] `export`: normalización de `segments` (válidos/ordenados/mínimo).
- [ ] `EditorAvanzado`: dividir + borrar cambia los segmentos; undo/redo; render manda `segments`.

## Verificación (gates)

- [ ] Type-check · lint · tests verdes.
- [ ] Comprobación propia: **render real de 2 segmentos** (headless con el ffmpeg de osn) produce un MP4
      con la duración = suma de los conservados y audio correcto.

## Cierre

- [ ] **Detenerse** — el owner prueba E2E (dividir, borrar del medio, reproducir con saltos, render,
      undo/redo) y da el OK.
- [ ] Merge a `main` con `--no-ff` y rama borrada (sin release; el 0.8.0 se publica al final).
- [ ] `spec/constitution/roadmap.md` actualizado.
