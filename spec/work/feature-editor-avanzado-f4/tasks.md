# Tasks — Editor avanzado (NLE) — Fase 4: reencuadre por relación de aspecto + reposición

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. `@shared/reframe`: tipo `Reframe`, `DEFAULT_REFRAME`, `ASPECT_RATIOS`, `MAX_ZOOM`, `outputRatio`,
      `clampOffset`, `reframeGeometry` (cover/contain/identity, redondeo a par), `previewTransform`,
      `reframeVideoFilter`, `applyPan`, `wheelToZoom`, `normalizeReframe`.
- [x] 2. Render: `reframe`+`sourceWidth/Height` en `FfmpegJob`; unificar el vídeo en `filter_complex`
      cuando hay reframe (ruta simple `-ss/-t` y ruta concat de F3, aplicando el reframe antes del
      `split`); rutas sin reframe **intactas**.
- [x] 3. IPC/export: `ExportRequest.reframe`+`sourceWidth/Height` + `normalizeReframe`; `ExportRun`
      pasa `reframe` y dims al job (las dims las manda el renderer desde el `<video>`).
- [x] 4. `ReframeControls.tsx`: chips de aspecto + toggle recorte/barras + slider de zoom + Centrar.
- [x] 5. `EditorAvanzado.tsx`: estado `reframe` y dims de la fuente (de `onLoadedMetadata`); marco de
      previa con aspecto de salida + `previewTransform` (medido con `ResizeObserver`); drag (offset) y
      wheel/slider (zoom) en modo cover con re-clamp; render mandando `reframe`+dims.
- [x] 6. Estilos `.eav-frame` y controles de reencuadre en `styles.css`.

## Tests unitarios (obligatorios)

Camino feliz **y** casos borde.

- [x] `reframe`: geometría **cover** de 16:9→9:16 a zoom 1 (recorte centrado, dims pares) y con
      zoom/offset (recorte más chico y desplazado, clampado a los bordes).
- [x] `reframe`: geometría **contain** de 16:9→9:16 (letterbox) y 9:16→16:9 (pillarbox), pad par.
- [x] `reframe`: `original` = identity (sin filtro; `reframeVideoFilter` → null).
- [x] `reframe`: `clampOffset` impide que el recorte se salga; redondeo a **par** con fuente de dims
      impares.
- [x] `reframe`: `previewTransform` y `reframeVideoFilter` describen el **mismo** rectángulo (preview =
      render).
- [x] `reframe`: `normalizeReframe` rechaza aspect/mode inválidos, clampa zoom a `[1, MAX_ZOOM]`, y
      `original` → sin reframe.
- [x] `ffmpeg-args`: MP4 con reframe en **ruta simple** (vídeo por `filter_complex`, `[vout]` mapeado);
      cover y contain.
- [x] `ffmpeg-args`: MP4 con reframe en **ruta concat** (reframe antes del `split`, N segmentos).
- [x] `ffmpeg-args`: **sin** reframe / `original` / sin dims → args idénticos a los de hoy (regresión).
- [x] `export`: `normalizeExportRequest` acepta y sanea `reframe`+dims; omite si `original`/sin dims.
- [x] `editor-avanzado.test.tsx`: elegir aspecto activa los controles; el render manda el `reframe`+dims.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 709 tests (+32)
- [x] Comprobación manual (headless): render real con el ffmpeg de osn — cover 9:16 (404×720), cover
      1:1 (720×720), contain 9:16 (1280×2276) y **concat 2 cortes + reframe 9:16** (404×720, 5.00 s).
      Dimensiones exactamente las que predice el módulo puro.
- [x] E2E del owner: OK ("funcionando perfecto"). Dos bugs de previa cazados y arreglados (bucle de
      tamaño del marco → parpadeo; desbordamiento del `<video>` con aspecto `original`), verificados en
      Chromium headless.

## Cierre

- [x] Aprobación del owner (E2E)
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado (nota de F4 en el bloque del editor avanzado)
