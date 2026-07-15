# Spec — Editor avanzado (NLE) — Fase 2: audio en vivo por pista

**Tipo:** Feature (fase de un feature multi-fase)
**Rama:** `feature/editor-avanzado-f2`
**Fecha:** 2026-07-14
**Base:** Fase 1 (`feature/editor-avanzado`, ya en `main`).

## Problema / Objetivo

En la Fase 1 el editor avanzado ya deja **ver los espectros por pista y ajustar su volumen**, pero al
**reproducir** suena la **mezcla `default`** original del clip (la que trae el `<video>`): lo que oyes
**no** refleja tus cambios de volumen ni las pistas eliminadas. Solo lo compruebas renderizando.

El objetivo de la Fase 2 es que **lo que oyes al reproducir sea exactamente lo que se va a renderizar**:
cada pista desglosada a su volumen actual, las eliminadas en silencio, mezcladas en vivo. Así el editor
de audio se vuelve usable de verdad (ajustas y oyes el resultado al instante, sin renderizar).

Esto encaja con la visión global del feature: *"el audio de salida se **reconstruye** desde las
desglosadas con sus volúmenes"*. La Fase 2 hace esa misma reconstrucción **en tiempo real**.

## Contexto técnico (por qué no basta el `<video>`)

Chromium solo decodifica la **primera** pista de audio del MP4 (la mezcla `default`). Por eso el
`<video>` no puede darnos las pistas por rol. La onda por pista (Fase 1) ya la resuelve el **main con
ffmpeg**; la Fase 2 hace lo análogo para el **audio real**: el main extrae cada pista seleccionable y el
renderer las mezcla en vivo con la **Web Audio API** (un `GainNode` por pista), colgadas del **reloj del
`<video>`** (fuente de verdad del tiempo, como fijó el plan de la Fase 1). El `<video>` reproduce en
**silencio** (solo imagen); el audio lo pone el motor Web Audio.

## Alcance — Fase 2

**Dentro:**
- Al pulsar **play**, suena la **reconstrucción en vivo**: cada pista desglosada a su ganancia actual
  (0–200 %), las **eliminadas en silencio**, sumadas. El `<video>` va **mudo**.
- **El volumen (rueda/slider) se oye al instante**, sin reiniciar la reproducción ni renderizar.
- **Eliminar/restaurar** una pista la silencia/reactiva en vivo.
- **Sincronía con el vídeo:** el audio sigue al `<video>` (play/pausa/stop y **seek** por la regla o el
  playhead reposicionan el audio). Corrección de deriva acotada (si audio y vídeo se separan más de un
  umbral, se re-sincroniza).
- **Clip de una sola pista** (sin multi-audio): se reproduce esa única pista con su volumen (permite
  también amplificar por encima del 100 %, que el `<video>` solo no puede).
- **Carga perezosa:** el audio por pista se pide al main en el **primer play** (no al abrir el editor),
  en paralelo, con feedback si aún está cargando. No penaliza abrir el editor si no se reproduce.
- **Degradación limpia:** si la Web Audio API no está disponible o la extracción de una pista falla, esa
  pista no suena (best-effort) pero el editor sigue funcionando (recorte, volúmenes, render intactos).
- Tests unitarios de la lógica pura nueva (args de extracción por pista, decisión de re-sync por deriva,
  mapeo de ganancias) y de que el motor **no rompe** sin `AudioContext` (jsdom).

**Fuera de la Fase 2 (explícito):**
- El **render** no cambia: sigue reconstruyendo la mezcla con ffmpeg (Fase 1). Esta fase solo afecta a la
  **previsualización** en vivo.
- **Cortes múltiples / segmentos** (Fase 3): el audio en vivo respeta el reloj del vídeo tal cual; no hay
  saltos de segmento que sincronizar todavía.
- **Reencuadre** (Fase 4) y **extras** (Fase 5).
- No se toca el editor simple, ni el formato de grabación, ni las pistas que produce la captura.
- No hay medidores de nivel (VU) ni waveform "en vivo" moviéndose con el playhead: eso queda fuera.

## Criterios de aceptación — Fase 2

Observables y verificables uno a uno:

- [ ] Al reproducir, se oye la **mezcla reconstruida** (pistas a su volumen, eliminadas en silencio), no
      la mezcla `default` original.
- [ ] Subir/bajar el volumen de una pista con la rueda o el slider **se oye al momento**, sin cortar la
      reproducción.
- [ ] Eliminar una pista la **silencia** en vivo; restaurarla la vuelve a oír.
- [ ] Play/pausa/stop y **seek** (regla o playhead) mantienen imagen y audio sincronizados.
- [ ] Un clip **sin multi-audio** se reproduce con su única pista y su volumen (incl. > 100 %).
- [ ] Lo que se oye en la preview **coincide** con lo que produce "Renderizar vídeo" a esos mismos
      volúmenes (misma reconstrucción).
- [ ] Si algo del audio en vivo falla (sin `AudioContext`, extracción fallida), el editor **no se rompe**:
      recorte, volúmenes y render siguen funcionando.
- [ ] Type-check, lint y tests verdes, con tests unitarios nuevos para la lógica pura añadida.
