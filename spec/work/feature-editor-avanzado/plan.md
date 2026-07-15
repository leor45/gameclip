# Plan — Editor avanzado (NLE) — Fase 1

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.
> Cubre solo la **Fase 1**. Cada fase posterior tendrá su propio plan sobre esta base.

## Enfoque

Editor nuevo y aislado que **no toca** el editor simple. Renderiza siempre a un **archivo nuevo**
(como el export actual): nunca muta ni borra el clip original. El backend de render es ffmpeg, ya
presente; el grueso del trabajo es la **UI del timeline**. La Fase 1 sienta la base (modelo de
timeline, reproducción, render) diseñada para que las fases 2–5 la extiendan sin rehacerla.

**1. Ruta y entrada.**
Nueva ruta `#/editor-avanzado/:clipId` (HashRouter, como el editor actual). En `Editor.tsx` se
añade un botón "Editor avanzado" que navega ahí. El editor simple queda intacto.

**2. Modelo de timeline (estado del editor).**
Estado puro y serializable, pensado para crecer:
- `durationSeconds`, `trim: { start, end }` (Fase 1: un rango; Fase 3 pasará a `segments[]`).
- `audioTracks: { key, index, name, volume /*0..2*/, removed }[]` — derivado de las pistas sondeadas.
- `zoom` (px/segundo), `playhead` (segundos).
La lógica pura (clamp de trim, set de volumen, mapear a ordinales/ganancias para ffmpeg) va a un
módulo shared testeable, sin React.

**3. Espectros por pista (main + ffmpeg).**
Como en el plan previo: el main extrae cada pista a PCM mono 8 kHz (`-map 0:a:N -f s16le`) y reduce
a ~N picos normalizados `0..1` (reducción pura y testeable). Nuevo canal IPC `ClipGetAudioWaveforms`
→ `{ trackKey, peaks[] }[]`. Best-effort: si falla, la pista se muestra sin onda. (Motivo:
`decodeAudioData` del navegador solo lee la pista `default`, no las fuentes por rol.)

**4. Reproducción / playhead.**
Un `<video>` (oculto tras el lienzo de preview) es la fuente de verdad del tiempo. El playhead lee
`currentTime` en un `requestAnimationFrame` mientras suena; arrastrar el playhead o hacer click en
la regla setea `video.currentTime`. Audio = la mezcla `default` del clip (Fase 1). Play/pausa/stop.

**5. Timeline UI (componentes nuevos, canvas donde convenga).**
- `Timeline` — regla + zoom + playhead + filas; convierte tiempo↔px con `zoom`.
- `AudioTrackRow` — nombre, `Waveform` en `<canvas>`, control de volumen por **rueda** (`onWheel`,
  `preventDefault`) y arrastre vertical, botón de eliminar (basurero). El volumen escala la onda.
- `Waveform` — dibuja los picos en canvas, coloreado con la paleta GameClip (acento sobre panel),
  reutilizable en fases futuras.
- Recorte: dos asas (inicio/fin) sobre el timeline; overlay atenuado fuera del rango.

**6. Preview UI.**
Área central con el `<video>` a `object-fit: contain`, barra superior con título del "borrador",
Salir (vuelve a biblioteca) y **Renderizar vídeo**. (El selector de aspecto y la captura de frame
del mockup son Fase 4/5: en Fase 1 la barra los deja fuera o deshabilitados con tooltip
"Próximamente".)

**7. Render (reutiliza ExportManager).**
"Renderizar vídeo" → modal (calidad alta/media/baja, formato MP4, botón que abre el diálogo de
guardado del SO). El main construye el job: recorte (`-ss/-t`, ya soportado) + audio mezclado con
**ganancias por pista**. Progreso por el evento `progress` existente y cancelación. El resultado es
un archivo nuevo en el destino elegido; el original no se toca.

**8. ffmpeg — ganancia antes del amix.**
`amixFilter` gana una variante con `volume=<g>` por entrada antes del `amix` (`normalize=0`, igual
que hoy). Pistas con ganancia 0 o eliminadas se excluyen; si no queda ninguna, audio silenciado.
Reutilizado por el render. (Este trozo es el que venía del plan de "volumen+espectro".)

## Archivos / módulos afectados (Fase 1)

- `src/renderer/views/EditorAvanzado.tsx` *(nuevo)* — pantalla del editor avanzado.
- `src/renderer/components/timeline/Timeline.tsx`, `AudioTrackRow.tsx`, `Waveform.tsx`,
  `Playhead.tsx` *(nuevos)* — piezas del timeline.
- `src/renderer/components/RenderDialog.tsx` *(nuevo)* — modal de calidad/formato/destino.
- `src/shared/timeline.ts` *(nuevo)* — modelo puro del timeline + helpers (clamp trim, volúmenes,
  mapeo a ganancias por ordinal). Testeable.
- `src/renderer/views/Editor.tsx` — botón "Editor avanzado".
- `src/renderer/main.tsx` (o donde estén las rutas) — registrar la ruta nueva.
- `src/main/export/ffmpeg-args.ts` — variante de `amixFilter`/`audioArgs` con ganancias.
- `src/main/export/manager.ts` — el render con ganancias (reutiliza `run`).
- `src/main/export/waveform.ts` *(nuevo)* — extracción PCM por pista + reducción a picos.
- `src/main/ipc.ts` — handler `ClipGetAudioWaveforms`; el `ExportRun` acepta ganancias por pista.
- `src/shared/ipc.ts` — canal `ClipGetAudioWaveforms` + contrato.
- `src/shared/export.ts` — `ExportRequest.trackVolumes` (+ normalización).
- `src/shared/tracks.ts` — helpers de ganancia por ordinal + normalización de volúmenes.
- `src/preload/index.ts` — expone `editor.getWaveforms` y el render.
- `src/renderer/styles.css` — estilos del editor avanzado (timeline, filas, preview, modal), con la
  paleta GameClip.
- Tests: `ffmpeg-args.test.ts`, `export.test.ts`, `tracks.test.ts`, `timeline.test.ts` *(nuevo)*,
  `waveform.test.ts` *(nuevo)*, y test de render del `EditorAvanzado` (renderiza, monta el timeline).

## Decisiones y alternativas consideradas

- **Editor nuevo separado, render a archivo nuevo.** No reescribe el original (a diferencia de
  "Guardar edit" del simple), así que no hay migración de DB ni mutación in-place en Fase 1.
  Alternativa descartada: ampliar el editor simple — el owner pidió mantenerlo tal cual.
- **Tiempo gobernado por el `<video>`.** Fuente de verdad única para el playhead; evita derivas
  entre un reloj propio y el vídeo. El motor de audio multipista (Fase 2) se colgará de este mismo
  reloj.
- **Espectros en el main.** Única forma de tener onda **por pista** (el navegador solo decodifica
  la mezcla). Coste: un ffmpeg por pista al abrir, best-effort.
- **Volumen lineal 0–200 % con rueda.** Coincide con la interacción pedida; `volume` de ffmpeg es
  lineal. Sin limitador (coherente con el mixer actual de libobs); el hint avisa del posible clip.
- **Modelo `trim` como rango único pero encapsulado.** Diseñado para migrar a `segments[]` en
  Fase 3 sin tocar la UI de reproducción/render.

## Riesgos

- **Tamaño de la UI del timeline.** Es la mayor incógnita; se acota a Fase 1 (recorte simple, sin
  ripple ni undo). Componentes pensados para reutilizarse en fases siguientes.
- **Rueda del ratón y scroll de página.** El `onWheel` sobre pistas debe `preventDefault` sin
  romper el scroll del resto; se aísla al área de la pista.
- **Coste de arranque** (un ffmpeg por pista para el espectro): audio mono 8 kHz, en paralelo,
  best-effort.
- **Clipping** al sumar pistas amplificadas: asumido y documentado, sin limitador.
- **Sincronía playhead/preview** con clips largos: mitigado usando el reloj del `<video>` y `rAF`.

---

**Estado:** ⏳ pendiente de aprobación
