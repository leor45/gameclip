# Spec — Editor avanzado (NLE) — Fase 1: timeline, recorte, audio y render

**Tipo:** Feature (multi-fase)
**Rama:** `feature/editor-avanzado`
**Fecha:** 2026-07-14

## Problema / Objetivo

El editor actual solo recorta (un rango) y mutea pistas. Falta una herramienta de edición
**visual tipo editor de vídeo**: timeline con playhead, ver los **espectros** de cada pista,
ajustar su **volumen**, eliminar audios, y **renderizar** el resultado a un archivo nuevo con
calidad y destino elegidos. El objetivo global es un **editor avanzado** que conviva con el simple
(el simple se queda **igual**), accesible desde un botón "Editor avanzado".

Por su tamaño se entrega **por fases**. Este spec cubre el objetivo global y detalla la **Fase 1**.

### Visión global (todas las fases)

- Timeline multipista con regla de tiempo, playhead, zoom.
- Recorte simple (Fase 1) → **cortes múltiples** con dividir/borrar y undo-redo (Fase 3).
- Pistas de audio con espectro, volumen por pista (scroll), y eliminar (Fase 1); **audio en vivo**
  por pista al reproducir (Fase 2).
- **Solo pistas desglosadas.** El editor trabaja con las fuentes por rol (juego, micro, apps), no
  con la mezcla `default`: esa no se muestra ni se edita, y el audio de salida se **reconstruye**
  desde las desglosadas con sus volúmenes. Si el clip se grabó **sin** multi-audio (una sola
  pista), se muestra esa única pista.
- Previsualización con **reencuadre por relación de aspecto y reposición** (Fase 4).
- **Render** a archivo nuevo con calidad y destino, sin tocar el original (Fase 1).
- Extras: captura de frame, filmstrip real, drafts persistentes (Fase 5).

## Alcance — Fase 1

**Dentro:**
- Botón "Editor avanzado" en el editor actual → nueva ruta `#/editor-avanzado/:clipId`. El editor
  simple no cambia.
- **Timeline**: regla con marcas de tiempo, **playhead** arrastrable, click en la regla para
  posicionar, **zoom** in/out (px por segundo). Una fila de **vídeo** (barra con nombre; filmstrip
  queda best-effort) y una fila por **pista de audio desglosada** con su **espectro (waveform)**
  real —una por pista, generada por el main con ffmpeg—. La mezcla `default` no aparece; si el clip
  no tiene multi-audio, se muestra su única pista.
- **Reproducción**: play / pausa / stop, el playhead sigue al vídeo y el vídeo sigue al playhead al
  hacer seek. El audio que suena es la **mezcla original** del clip (el audio en vivo por pista es
  Fase 2).
- **Recorte simple**: marcadores de inicio/fin sobre el timeline (un rango). La zona fuera se
  atenúa. Es lo que se renderiza.
- **Audio por pista**: **volumen** 0–200 % ajustable con la **rueda del ratón** sobre la pista (y
  arrastre vertical), reflejado en el espectro; **eliminar** una pista (excluirla de la salida).
  100 % = original, 0 % = silenciada.
- **Render**: botón "Renderizar vídeo" → modal con **calidad** (alta/media/baja), **formato** (MP4)
  y **destino** (diálogo de guardado) → ffmpeg produce el archivo con el recorte y la mezcla de
  audio a los volúmenes elegidos, con **barra de progreso** y cancelación. **El clip original no se
  toca ni se borra.**
- Tests unitarios de la lógica pura nueva (filtro ffmpeg con ganancias, reducción a picos del
  espectro, construcción del job de render, modelo de timeline).

**Fuera de la Fase 1 (explícito):**
- Audio **en vivo** por pista al reproducir (Fase 2).
- **Cortes múltiples**, dividir/borrar segmentos, ripple, undo/redo (Fase 3).
- **Reencuadre/relación de aspecto** y reposición del encuadre (Fase 4).
- Captura de frame, filmstrip completo, drafts persistentes (Fase 5).
- No se modifica el editor simple ni el formato de grabación ni las pistas que produce la captura.
- El GIF no entra en el render avanzado de Fase 1 (solo MP4).

## Criterios de aceptación — Fase 1

Observables y verificables uno a uno:

- [ ] Desde el editor simple, "Editor avanzado" abre el editor nuevo del mismo clip; el simple
      sigue funcionando igual.
- [ ] El timeline muestra la regla de tiempo, un playhead que se puede arrastrar, zoom in/out, la
      fila de vídeo y una fila por pista de audio con su espectro real.
- [ ] Play/pausa/stop funcionan; al arrastrar el playhead el vídeo salta a ese tiempo; al
      reproducir, el playhead avanza con el vídeo.
- [ ] Se puede fijar inicio y fin del recorte y la zona fuera se ve atenuada.
- [ ] La rueda del ratón sobre una pista sube/baja su volumen (0–200 %); el espectro refleja el
      cambio; se puede eliminar una pista.
- [ ] "Renderizar vídeo" abre el modal de calidad/formato/destino; al aceptar, renderiza un MP4 con
      el recorte y los volúmenes aplicados, con barra de progreso, **sin borrar ni alterar el clip
      original**.
- [ ] Type-check, lint y tests verdes, con tests unitarios nuevos para la lógica pura añadida.
