# Plan — Editor avanzado (NLE) — Fase 4: reencuadre por relación de aspecto + reposición

> **Este plan es un contrato.** Cubre solo la **Fase 4**. Se propone y se **espera el OK del owner
> antes de codear** (la verificación E2E la hace el owner al final). Aprobado, el alcance queda fijo.

## Enfoque

Toda la geometría vive en un módulo puro nuevo `@shared/reframe`, del que **derivan las dos salidas**
—la transformación CSS de la previa y el filtro de vídeo de ffmpeg— desde una **única** geometría
canónica, para que preview y render no puedan divergir. La UI y el render lo consumen; el editor
**simple** no se toca.

**1. Módulo puro `@shared/reframe`.**
- `Reframe { aspect, mode, zoom, offset:{x,y} }`; `DEFAULT_REFRAME` = `{ aspect:'original', mode:'cover',
  zoom:1, offset:{x:0,y:0} }`; `ASPECTS` = mapa preset → ratio (`16:9`→16/9, `9:16`→9/16, `1:1`→1,
  `4:5`→4/5). `MAX_ZOOM` (p. ej. 4).
- `outputRatio(reframe, sourceW, sourceH)` — el ratio de salida; con `original`, el de la fuente.
- `clampOffset(reframe, sourceW, sourceH)` — acota `offset` para que el recorte de `cover` no se salga.
- `reframeGeometry(reframe, sourceW, sourceH)` — **geometría canónica**, el corazón del módulo:
  - `cover`: rectángulo de recorte en píxeles de origen `{cropX, cropY, cropW, cropH}` con el aspecto de
    salida; a `zoom=1` es el mayor que cabe, a `zoom=z` es `/z` centrado por `offset` (clampado). La
    salida son esas dimensiones de recorte redondeadas a **par**.
  - `contain`: la fuente entera escalada dentro de un lienzo con el aspecto de salida `{scaledW, scaledH,
    padX, padY, canvasW, canvasH}`, todo **par**.
  - `original`: sin recorte ni pad (marca `identity: true`).
- `previewTransform(geom, frameW, frameH)` — `{ scale, translateX, translateY }` para colocar el
  `<video>` (con `transform-origin` top-left) de modo que el marco muestre exactamente la geometría.
- `reframeVideoFilter(geom)` — cadena de filtro de vídeo, o `null` si `identity`:
  - `cover`: `crop=cw:ch:cx:cy,scale=ow:oh`.
  - `contain`: `scale=sw:sh,pad=canvasW:canvasH:padX:padY:black`.
- Todo con redondeo a par y sin dependencias de Electron/DOM. Tests en `@shared/__tests__/reframe.test.ts`.

**2. Render — el vídeo pasa por filtro (`main/export/ffmpeg-args`).**
`FfmpegJob` gana `reframe?: Reframe` y las dimensiones de la fuente (`sourceWidth`, `sourceHeight`) —
necesarias para calcular la geometría en píxeles. El reencuadre **fuerza el filtergraph de vídeo** en
las tres rutas (hoy la ruta rápida y el `audioArgs` con ganancias mezclan `-vf`/`-filter_complex` de
forma incompatible; se unifica todo en un `filter_complex`):
- Cuando hay reencuadre no-identity, el vídeo se procesa como `[0:v]<reframeVideoFilter>[vout]` (ruta
  simple con `-ss/-t`) y se **mapea `[vout]`** en vez de `0:v:0`; el audio se compone en el **mismo**
  `filter_complex` (la `gainMixFilter`/`amixFilter` ya devuelven cadenas que se concatenan con `;`).
- **Ruta concat (F3, ≥2 segmentos):** el reframe se aplica **una vez** a `[0:v]` → `[vr]` **antes** del
  `split=N`, así cada `trim` parte de la imagen ya reencuadrada (un solo `crop/scale`, no N).
- Sin reencuadre (`original` o `reframe` ausente) → **las rutas actuales quedan intactas** (fast path
  `-ss/-t` con `-c copy` de vídeo por libx264 sin `-vf`, y concat como en F3).
- El códec de vídeo no cambia (libx264 veryfast + crf por calidad + yuv420p + faststart).

**3. IPC / export (`@shared/export`, `main/ipc`).**
`ExportRequest` gana `reframe?: Reframe` con `normalizeReframe(input)` (valida aspect ∈ presets, mode ∈
{cover,contain}, zoom finito en `[1, MAX_ZOOM]`, offset finito, normaliza a `original`→sin reframe).
`ExportRun` resuelve `sourceWidth/Height` del clip (del sondeo que ya hace el editor, ver punto 5) y los
pasa al job junto al `reframe`. El editor **simple** no manda `reframe` (ruta intacta).

**4. Previsualización WYSIWYG (`EditorAvanzado.tsx` + CSS).**
- Estado `reframe: Reframe` en el editor (no entra en el historial undo/redo de cortes de F3 — como el
  volumen, es un ajuste continuo/independiente).
- La previa envuelve el `<video>` en un **marco** `.eav-frame` con `aspect-ratio` = ratio de salida,
  letterboxed dentro de `.eav-preview` (que ya centra sobre negro), con `overflow:hidden`. El `<video>`
  se coloca con la `transform` de `previewTransform` (medida la `frameW/frameH` reales con un
  `ResizeObserver`/ref). Con `original`, sin marco especial (como hoy).
- **Interacción (solo `cover`):** `pointerdown`+drag sobre la previa mueve `offset` (convertido de px de
  pantalla a fracción de origen); `wheel` sobre la previa ajusta `zoom` (clampado a `[1, MAX_ZOOM]`);
  botón "Centrar". `offset` se re-clampa con `clampOffset` en cada cambio (y al cambiar de aspecto/zoom).
- Render: el `ExportRequest` suma `reframe` (además de `segments` de F3 y `trackVolumes` de F1/2).

**5. Dimensiones de la fuente.**
El editor necesita `videoWidth/videoHeight` del clip: se leen del `<video>` en `onLoadedMetadata`
(`videoRef.current.videoWidth/Height`) y se guardan en estado; se mandan en el request y el main los pasa
al job. (No hace falta ffprobe: el `<video>` ya está cargado en la previa.)

**6. UI de controles (`components/editor-avanzado`).**
- `ReframeControls.tsx` *(nuevo)*: segmented de aspecto + toggle recorte/barras + slider de zoom + botón
  Centrar; deshabilita modo/zoom/centrar cuando `aspect==='original'`. En la barra superior o junto a la
  previa.

## Archivos / módulos afectados (Fase 4)

- `src/shared/reframe.ts` *(nuevo)* — tipo `Reframe`, presets, clamp, geometría, transform de preview,
  filtro de vídeo, `normalizeReframe`.
- `src/shared/__tests__/reframe.test.ts` *(nuevo)* — geometría cover/contain/original, clamp de offset,
  redondeo a par, transform de preview, filtro de ffmpeg, normalización.
- `src/main/export/ffmpeg-args.ts` — `reframe`+`sourceWidth/Height` en `FfmpegJob`; unificar el vídeo en
  `filter_complex` cuando hay reframe (ruta simple y concat); rutas intactas sin reframe.
- `src/main/__tests__/ffmpeg-args.test.ts` — args con reframe en ruta simple y concat; sin reframe = args
  de hoy (regresión).
- `src/shared/export.ts` — `ExportRequest.reframe` + `normalizeReframe`. Tests en `export.test.ts`.
- `src/main/ipc.ts` — `ExportRun` pasa `reframe` y `sourceWidth/Height` al job.
- `src/renderer/views/EditorAvanzado.tsx` — estado `reframe`, dims de la fuente, marco de previa con
  transform, drag/zoom/centrar, render con reframe.
- `src/renderer/components/editor-avanzado/ReframeControls.tsx` *(nuevo)* — controles de reencuadre.
- `src/renderer/styles.css` — `.eav-frame` (aspecto + overflow) y estilos de los controles.
- `src/renderer/__tests__/editor-avanzado.test.tsx` — elegir aspecto/modo, que la previa cambie de
  aspecto, y que el render mande el `reframe`.

## Decisiones y alternativas consideradas

- **Geometría canónica única → preview y render.** Alternativa descartada: calcular el `transform` de CSS
  y los args de ffmpeg por separado. Divergirían por redondeos y la previa mentiría. Una sola función de
  geometría (en píxeles de origen) y dos proyecciones triviales garantizan **preview = render**.
- **Reframe estático, uno por clip.** Pan/zoom animado y reframe por segmento multiplican la complejidad
  (keyframes, interpolación, mapear tiempo↔encuadre) por un caso que el owner no pidió; quedan fuera.
- **Reframe antes del `split` en la ruta concat.** Aplicarlo una vez a `[0:v]` y luego trocear es más
  barato (un solo `crop/scale`) y no puede desincronizar segmentos frente a reencuadrar cada `[vi]`.
- **Unificar vídeo+audio en `filter_complex` solo cuando hay reframe.** No se puede combinar `-vf` con el
  `-filter_complex` que ya usa la mezcla de audio por ganancias; en vez de reescribir todo, la ruta sin
  reframe queda **idéntica** (fast path/concat de F3) y solo la ruta con reframe pasa el vídeo por el
  grafo. Menos riesgo de regresión.
- **Dims de la fuente desde el `<video>`, no ffprobe.** El clip ya está cargado en la previa; añadir un
  sondeo sería trabajo y latencia de más.
- **Reframe fuera del historial undo/redo.** Igual que el volumen (F1/2): es un ajuste continuo; el
  historial se reserva a las operaciones discretas de corte (F3).
- **Solo presets de aspecto.** Cubren Shorts/Reels/TikTok/Instagram; un W:H libre suma UI y casos borde
  sin caso de uso pedido. Se puede añadir en un spec futuro.
- **Sin bump de versión.** La app sigue en `0.8.0`; el release se hace una vez al terminar las cinco fases.

## Riesgos

- **Filtergraph combinado (reframe + concat + mezcla por ganancias).** Es la pieza con más partes. Mitigado:
  construcción **pura y testeada** (args exactos en las tres rutas) + verificación headless de un render
  real con reframe (cover y contain) antes de entregar.
- **Dimensiones pares.** libx264/`yuv420p` exige ancho y alto pares; el redondeo a par vive en el módulo
  puro y se testea (incluye fuentes de dimensiones impares/atípicas).
- **Preview↔render coincidentes.** El riesgo clásico es que la previa CSS no cuadre con el `crop` de
  ffmpeg (origen del transform, dirección del offset, redondeos). Mitigado por la geometría única y un
  test que comprueba que `previewTransform` y `reframeVideoFilter` describen el **mismo** rectángulo.
- **Clamp del offset al cambiar de aspecto/zoom.** Un offset válido para un aspecto puede salirse en otro;
  se re-clampa en cada cambio (probado en tests).
- **Coste del filtro de vídeo.** Con reframe el vídeo se reencodea con `crop/scale` (ya se reencodea hoy);
  sin reframe, ruta intacta. Asumido.

---

**Estado:** ✅ aprobado por el owner el 2026-07-14 (MAX_ZOOM 4×; salida conserva la dimensión limitante de la fuente).
