# Spec — Editor avanzado (NLE) — Fase 3: cortes múltiples (dividir/borrar) + undo/redo

**Tipo:** Feature (fase de un feature multi-fase)
**Rama:** `feature/editor-avanzado-f3`
**Fecha:** 2026-07-14
**Base:** Fases 1 y 2 (`feature/editor-avanzado*`, ya en `main`).

## Problema / Objetivo

El editor avanzado solo recorta **un rango** (inicio/fin). No se puede **quitar un trozo del medio**
(una muerte, una espera, un momento aburrido) conservando lo de antes y lo de después. El objetivo de
la Fase 3 es pasar de "un recorte" a **varios segmentos**: dividir en el playhead, **borrar** tramos
—incluidos los del medio— y que el resultado se **una** (ripple) al reproducir y al renderizar, con
**deshacer/rehacer**.

El plan de la Fase 1 ya lo dejó preparado: el recorte era "un rango único pero encapsulado, diseñado
para migrar a `segments[]` sin tocar la UI de reproducción/render".

## Modelo

La edición pasa a ser una lista de **segmentos conservados** `Segment[] = { start, end }[]` en
**tiempo de origen**, ordenados y sin solape. Inicialmente un único segmento `[0, duración]`. Los
**huecos** entre segmentos son los tramos borrados. La salida (preview y render) es la
**concatenación** de los segmentos conservados.

## Alcance — Fase 3

**Dentro:**
- **Modelo de segmentos** puro y testeable (`@shared/timeline`): dividir en un tiempo, borrar un
  segmento (deja al menos uno), duración conservada, siguiente tiempo conservado (para el salto en
  reproducción), y el recorte de bordes (inicio/fin) como ajuste del primer/último segmento.
- **Dividir** (split) en la posición del playhead: botón "Dividir" (y tecla `S`). No divide si dejaría
  un trozo menor que el mínimo.
- **Borrar segmento:** seleccionar un segmento (clic) y borrarlo (botón/basurero o tecla `Supr`),
  creando un hueco. Siempre queda al menos un segmento.
- **Recorte de bordes** (Fase 1) sigue: las asas de inicio/fin mueven el borde del primer/último
  segmento.
- **Visual:** una barra de cortes muestra los segmentos conservados como bloques (el seleccionado
  resaltado) y los huecos como zonas atenuadas; el atenuado de los huecos se refleja en las pistas.
- **Ripple en la preview:** al reproducir, cuando el playhead entra en un hueco **salta** al inicio del
  siguiente segmento; al pasar el último, se detiene. El audio en vivo (Fase 2) sigue por el mismo
  `seek`, así que tampoco suena lo borrado.
- **Render:** el MP4 concatena los segmentos conservados (ffmpeg `trim`/`atrim` + `concat`),
  conservando la **mezcla por ganancias** por pista (Fase 1/2). Con un solo segmento se mantiene la
  ruta rápida `-ss/-t` actual. El clip original **no se toca**.
- **Deshacer/rehacer** de las operaciones de corte (dividir, borrar, recortar bordes): botones y
  `Ctrl+Z` / `Ctrl+Y` (y `Ctrl+Shift+Z`).
- Tests unitarios de la lógica pura nueva (modelo de segmentos, args de ffmpeg con concat, request de
  export con segmentos).

**Fuera de la Fase 3 (explícito):**
- **Reordenar** o mover segmentos (arrastrarlos a otra posición): los cortes solo **quitan**, no
  reordenan.

## Revisión durante la E2E (2026-07-14)

El owner probó los cortes y pidió dos cosas:
1. **Bug:** al reproducir sobre un hueco, el vídeo se quedaba pegado y el audio distorsionado. Causa:
   el `rAF` re-emitía `video.currentTime = next` cada frame mientras el seek se asentaba (varios
   frames), reiniciando también el motor de audio en bucle. Arreglado: el salto se emite **una sola
   vez** por hueco (`skipTargetRef`).
2. **Cerrar el hueco (ripple):** el owner eligió que borrar un segmento **cierre el hueco solo**. Esto
   mueve a **dentro de alcance** la "vista de salida compactada" que este spec había dejado fuera: la
   timeline pasa a mostrarse en **tiempo de salida** (segmentos contiguos, sin huecos), y el export ya
   concatenaba (sin cambios). El playhead, la regla, las ondas y las asas de recorte trabajan en tiempo
   de salida; el recorte de bordes se arrastra por **delta** con la escala congelada (sin re-escalar
   bajo el cursor). El `<video>` sigue en tiempo de origen y el salto de límite de segmento lo maneja
   el mismo ripple de reproducción.

Lo que sigue **fuera**: reordenar segmentos, propiedades por segmento, y el resto de fases (F4/F5).
- Propiedades por segmento (velocidad, transiciones, fundidos).
- Deshacer/rehacer de los cambios de **volumen** o de **eliminar pista** (solo de los cortes).
- **Reencuadre/aspecto** (Fase 4) y **extras** (Fase 5).
- El GIF no entra en el render por segmentos (el editor avanzado exporta MP4).

## Criterios de aceptación — Fase 3

Observables y verificables uno a uno:

- [ ] Se puede **dividir** el clip en la posición del playhead y **borrar** un segmento —incluido uno
      del medio—, dejando al menos un segmento.
- [ ] El recorte de bordes (inicio/fin) sigue funcionando.
- [ ] Los segmentos conservados y los huecos borrados se **ven** en la timeline (bloques + zonas
      atenuadas), con el segmento seleccionado resaltado.
- [ ] Al **reproducir**, el playhead salta los huecos y solo se ve/oye lo conservado; al pasar el final
      se detiene.
- [ ] **Renderizar vídeo** produce un MP4 que es la **concatenación** de los segmentos conservados, con
      los volúmenes por pista aplicados, **sin tocar el original**.
- [ ] **Deshacer** revierte el último corte y **rehacer** lo reaplica (botones y `Ctrl+Z`/`Ctrl+Y`).
- [ ] Type-check, lint y tests verdes, con tests unitarios nuevos para la lógica pura añadida.
