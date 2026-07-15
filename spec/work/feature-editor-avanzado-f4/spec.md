# Spec — Editor avanzado (NLE) — Fase 4: reencuadre por relación de aspecto + reposición

**Tipo:** Feature (fase de un feature multi-fase)
**Rama:** `feature/editor-avanzado-f4`
**Fecha:** 2026-07-14
**Base:** Fases 1, 2 y 3 (`feature/editor-avanzado*`, ya en `main`).

## Problema / Objetivo

El editor avanzado recorta en el tiempo (bordes + cortes múltiples de F3) y mezcla el audio por pista,
pero **la imagen sale siempre con la relación de aspecto del clip original** (típicamente 16:9). No hay
forma de sacar un **vertical 9:16** (Shorts/Reels/TikTok), un **cuadrado 1:1** o un **4:5** encuadrando
la parte que interesa. Hoy, para eso, hay que reencuadrar fuera de la app.

El objetivo de la Fase 4 es **reencuadrar en edición**: elegir una **relación de aspecto de salida**
distinta a la del clip y decidir **cómo encaja** la imagen —recortando (con reposición y zoom) o con
barras—, viéndolo en la previsualización tal cual saldrá, y que el **render** lo aplique sin tocar el
original. Se compone con lo ya hecho: el recorte temporal por segmentos (F3) y la mezcla de audio por
ganancias (F1/F2) siguen igual; la F4 solo añade la geometría del vídeo.

Es la penúltima fase del editor: **F5** es extras (captura de frame, filmstrip real, drafts).

## Modelo

Un **reencuadre** es un valor puro y testeable (`@shared/reframe`):

```
Reframe = {
  aspect: 'original' | '16:9' | '9:16' | '1:1' | '4:5',
  mode:   'cover' | 'contain',   // recorte reposicionable | barras
  zoom:   number,                // 1..MAX, solo aplica en 'cover'
  offset: { x: number; y: number }, // centro del encuadre, normalizado −1..1, solo 'cover'
}
```

- `aspect: 'original'` = comportamiento actual (sin reencuadre); `mode/zoom/offset` se ignoran.
- **`cover` (recorte):** la imagen **llena** el marco de salida y se recorta lo que sobra. `zoom` la
  agranda (1 = el máximo que cabe conservando el aspecto; >1 acerca) y `offset` mueve el encuadre; el
  offset se **clampa** para que el recorte no se salga de la fuente.
- **`contain` (barras):** la imagen **entera** cabe dentro del marco con bandas negras (letterbox o
  pillarbox según el caso). No hay reposición ni zoom.

A partir de `Reframe` + dimensiones de la fuente (`sourceW × sourceH`), una función pura calcula la
**geometría canónica** (rectángulo de recorte en píxeles de origen para `cover`, o encaje escalado con
relleno para `contain`) y de ahí derivan **las dos salidas, garantizando preview = render**:

1. La **transformación CSS** de la previsualización (escala + traslación del `<video>` dentro de un
   marco con el aspecto de salida).
2. Los **argumentos de ffmpeg** del vídeo (`crop`+`scale` para `cover`; `scale`+`pad` para `contain`),
   con dimensiones de salida **pares** (requisito de `yuv420p`/libx264).

## Alcance — Fase 4

**Dentro:**
- **Módulo puro `@shared/reframe`:** tipo `Reframe`, defaults, normalización (validación IPC), clamp del
  offset, cálculo de la geometría canónica, la transformación de preview y la construcción del filtro de
  vídeo de ffmpeg. Todo testeado.
- **Relaciones de aspecto de salida:** `original · 16:9 · 9:16 · 1:1 · 4:5`.
- **Modos de encaje:** `cover` (recorte reposicionable) **y** `contain` (barras negras).
- **UI de reencuadre en el editor avanzado:**
  - Selector de relación de aspecto (una fila de botones/segmented) y toggle de modo
    (recorte ↔ barras), deshabilitado el modo cuando el aspecto es `original`.
  - En modo `cover`: **arrastrar** la imagen en la previsualización reposiciona el encuadre y la
    **rueda** (o un slider) hace **zoom**. Reset a encuadre centrado.
- **Previsualización WYSIWYG:** el marco de la previa adopta el aspecto de salida (letterboxed dentro del
  área negra) y el `<video>` se ve ya recortado/escalado/con barras exactamente como se renderizará.
- **Render con reencuadre:** el MP4 aplica la geometría de vídeo, componiéndose con lo que ya hay —el
  recorte temporal simple (`-ss/-t`), la **concatenación** de segmentos de F3, y la mezcla de audio por
  ganancias de F1/F2—. El clip original **no se toca**.
- Tests unitarios de la lógica pura nueva (geometría, clamp, transform de preview, args de ffmpeg del
  vídeo en las rutas simple y concat, normalización del request).

**Fuera de la Fase 4 (explícito):**
- **Rotación** de la imagen, y **pan/zoom animados** (keyframes de movimiento): el reencuadre es
  **estático** (un solo encuadre para todo el clip).
- **Un reencuadre distinto por segmento:** el encuadre es único para toda la salida.
- **Aspectos arbitrarios** tecleados por el usuario: solo los presets de arriba.
- **GIF:** el reencuadre solo aplica al MP4 (el editor avanzado exporta MP4).
- Extras de F5 (captura de frame, filmstrip real, drafts persistentes).
- El editor **simple** no se toca (no tiene reencuadre).

## Criterios de aceptación — Fase 4

Observables y verificables uno a uno:

- [ ] Se puede elegir la relación de aspecto de salida (`original/16:9/9:16/1:1/4:5`); con `original` la
      previa se ve como hoy.
- [ ] En modo **recorte**, la previa llena el marco con el aspecto elegido; **arrastrar** reposiciona el
      encuadre y la **rueda/slider** hace zoom, sin que el recorte se salga de la imagen.
- [ ] En modo **barras**, la imagen entera cabe en el marco con bandas negras.
- [ ] **Renderizar vídeo** produce un MP4 con **la relación de aspecto y el encuadre elegidos**,
      combinado correctamente con el recorte temporal/segmentos y los volúmenes por pista, **sin tocar el
      original**. Lo renderizado coincide con la previa.
- [ ] El editor simple sigue igual; los clips que no reencuadran (aspecto `original`) rinden por la ruta
      de siempre.
- [ ] Type-check, lint y tests verdes, con tests unitarios nuevos para la lógica pura añadida.
