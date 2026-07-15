# Spec — Editor avanzado (NLE) — Fase 5: extras (captura de frame · filmstrip · drafts)

**Tipo:** Feature (fase final de un feature multi-fase)
**Rama:** `feature/editor-avanzado-f5`
**Fecha:** 2026-07-14
**Base:** Fases 1–4 (`feature/editor-avanzado*`, ya en `main`).

## Problema / Objetivo

El editor avanzado ya recorta (cortes múltiples), mezcla audio por pista y reencuadra. Faltan los
**extras** que lo redondean como editor y que la visión global dejó para el final:

1. **Captura de frame:** guardar el fotograma actual (con el reencuadre aplicado) como imagen, sin
   renderizar todo el clip. Hoy el botón 📷 está deshabilitado ("Próximamente").
2. **Filmstrip real:** la pista de vídeo es una barra vacía; debería mostrar **miniaturas** del clip a lo
   largo del tiempo, para orientarse al recortar.
3. **Drafts persistentes:** hoy, al salir del editor se **pierde** la edición (cortes, volúmenes,
   reencuadre). Deberían **guardarse por clip** y poder **retomarse** después.

Con esto se completan las **cinco fases** del editor avanzado y queda listo el **release 0.8.0**.

## Alcance — Fase 5

**Dentro:**

### A. Drafts persistentes (auto, por clip)
- El estado de edición (segmentos, volúmenes por pista, pistas eliminadas, reencuadre) se **auto-guarda
  por `clipId`** en `localStorage` (como la pref del panel de F4-post), en cuanto difiere del estado por
  defecto; vuelve al defecto (o con "Restablecer") → el draft se **borra**.
- Al **abrir** un clip en el editor avanzado, si tiene draft se **restaura** solo. Botón **Restablecer**
  (descarta el draft y vuelve al clip original).
- **Lista de ediciones en curso en la pestaña Editor** (`/editor` sin clip): tarjetas con el clip
  (miniatura/título) de cada edición sin terminar, con **Retomar** (→ editor avanzado) y **Quitar**. Si el
  vídeo de una edición ya no está en la biblioteca, la tarjeta lo dice en lenguaje sencillo ("Este vídeo
  ya no está en tu biblioteca") y deja **Quitar** la edición. **Sin ediciones:** mensaje (mejorado)
  invitando a editar.

**Nota de copy (importante):** todo el texto **visible por el usuario** va en lenguaje sencillo, sin
tecnicismos (nada de "draft", "huérfano", "clip", "localStorage"…). En la UI se dice **"edición"** o
**"edición sin terminar"**; "draft" solo se usa en el código/documentación interna.

### B. Captura de frame (📷 → biblioteca)
- El botón 📷 captura el **fotograma actual** de la previa, **con el reencuadre aplicado** (mismo recorte/
  barras que se ve y se renderizaría), como **PNG**.
- El PNG se guarda en la carpeta **Capturas** del juego del clip y se **da de alta en la biblioteca**
  (aparece como una captura más, sin diálogo), igual que las capturas por hotkey. Feedback breve al hacerlo.

### C. Filmstrip real (best-effort, acotado)
- La pista de vídeo muestra **N miniaturas fijas** (p. ej. ~16) muestreadas a lo largo de la **duración de
  salida** (respeta los cortes: los tiempos se mapean salida→origen), generadas **perezosamente** en el
  renderer (un `<video>` oculto + `canvas`) y **cacheadas** por clip. No se re-muestrea al hacer zoom (se
  estiran). **Best-effort:** si falla la extracción, la barra queda vacía como hoy.
- Tests unitarios de la lógica pura nueva (drafts: serialización/estado por defecto/listado; captura:
  nombre/geometría del recorte; filmstrip: tiempos de muestreo salida→origen).

**Fuera de la Fase 5 (explícito):**
- **Filmstrip denso por zoom** (re-muestrear al ampliar): queda en best-effort acotado.
- Diálogo "Guardar como" para la captura de frame (va directo a la biblioteca).
- Drafts sincronizados entre máquinas o en el main (es `localStorage` local, por decisión del owner).
- Edición de la imagen capturada, anotaciones, o exportar secuencias de frames.
- Sigue fuera todo lo ya descartado en fases previas (rotación, pan/zoom animado, reframe por segmento,
  aspectos libres, GIF en el editor avanzado).

## Criterios de aceptación — Fase 5

Observables y verificables uno a uno:

- [ ] Editar un clip (cortes/volumen/reencuadre), salir y **reabrirlo** restaura la edición; **Restablecer**
      la descarta y el draft desaparece.
- [ ] La pestaña **Editor** lista las ediciones sin terminar con **Retomar** y **Quitar**; sin ninguna,
      muestra el mensaje (mejorado). Quitar la saca de la lista. El texto es sencillo, sin tecnicismos.
- [ ] El botón **📷** guarda el fotograma actual (con el reencuadre) como PNG en la biblioteca (carpeta
      Capturas del juego), y aparece allí sin reiniciar.
- [ ] La pista de vídeo muestra **miniaturas reales** del clip a lo largo del tiempo (best-effort).
- [ ] El editor **simple** y el resto de la app siguen igual.
- [ ] Type-check, lint y tests verdes, con tests unitarios nuevos para la lógica pura añadida.

## Fixes durante la E2E del owner (14–15 jul)

La validación reveló que **📷 y el filmstrip no funcionaban** en la app real (sí en los tests). Causas raíz:

### F5-fix-1 — 📷 no reaccionaba (`sourceDims` nulo → botón `disabled`)
- **Síntoma:** al pulsar 📷 no pasa nada (ni mensaje ni PNG; verificado: sin PNG nuevo en `Capturas`).
- **Causa raíz:** `sourceDims` (dimensiones de origen) se fijaba **solo** en `onLoadedMetadata`. Ese
  evento se **pierde** cuando la metadata del `<video>` ya estaba cargada al montar (se llega al editor
  avanzado desde el visor simple con el mismo clip) o reporta `videoWidth === 0` en ese instante. El
  vídeo se ve igual (el frame se decodifica), pero `sourceDims` queda `null` → el botón 📷 está
  `disabled={!sourceDims}` → el clic no dispara nada. (Por lo mismo, el reencuadre F4 solo funcionaba "a
  veces", según el timing.) Descartado por eliminación: handler IPC presente en el build; `toDataURL` no
  taintea (probado en Electron headless); preload correcto.
- **Arreglo:** fijar `sourceDims` **y** `duration` también en `onLoadedData` (evento que sí llega —el
  frame se ve—) además de `onLoadedMetadata`; y como refuerzo, leer las dimensiones del `<video>`
  directamente al capturar. **Regresión:** 📷 funciona aunque solo llegue `loadedData`.

### F5-fix-2 — filmstrip siempre vacío (se cachea vacío con duración 0)
- **Síntoma:** la pista de vídeo queda azul, sin miniaturas.
- **Causa raíz:** al montar, el clip aún no cargó → `segments` con **duración 0** →
  `filmstripSampleTimes(...)` devuelve `[]` → `Filmstrip` "termina" con 0 frames y **cachea el array
  vacío** para ese clip. Como el efecto depende **solo de `[clipId]`**, **nunca reintenta** cuando llega
  la duración real (`StrictMode` lo agrava). La extracción en sí funciona (16 frames verificados en
  Electron headless contra un clip real).
- **Arreglo:** pasar la **duración real** a `Filmstrip`; **no extraer ni cachear con duración 0**;
  reintentar cuando la duración pasa a >0 (efecto con dep `[clipId, duration]`), y **no cachear
  resultados vacíos**. **Regresión** unit + verificación headless.
