# Spec — Editor avanzado: carga del audio (volumen, ■ y ▶ desde un hueco)

**Tipo:** Fix
**Rama:** `fix/editor-avanzado-carga-audio`
**Fecha:** 2026-10-09

## Problema / Objetivo

Tres hallazgos menores de la auditoría bug-hunter D sobre la reproducción del editor avanzado
(`src/renderer/views/EditorAvanzado.tsx`), todos en el camino del primer ▶ (la carga perezosa del audio
por pista, «Cargando audio…») o del arranque de ▶:

- **Bug 2 (Low) — un volumen cambiado durante «Cargando audio…» no se aplica.** Si mientras carga se
  mueve un deslizador (o se quita una pista), al acabar la carga el motor de audio en vivo vuelve al
  volumen de antes: el deslizador marca 30 % y suena al 100 %, o suena una pista que se acaba de quitar.
  Hasta tocar el control otra vez.
  **Causa raíz:** `ensureAudioLoaded` es una función del render en el que se hizo clic en ▶. Tras el
  `await engine.load(...)` recorre `tracks` y aplica `volumes` y `removed` **de ese render** (closure
  viejo), pisando lo que `setGain`/`toggleRemove` ya habían puesto en el motor durante la espera.
  (`LivePreviewAudio.setGain` sí funciona con la carga en curso: `load` crea los nodos de ganancia de
  forma síncrona al llamarse y `setGain` los actualiza, además de guardar la ganancia deseada en
  `targetGains`; el defecto es solo la reaplicación con datos viejos.)
- **Bug 3 (Low) — ■ durante «Cargando audio…» no cancela el ▶ pendiente.** ■ está habilitado durante
  la carga, pero al terminar ésta la reproducción arranca igual (vídeo mudo + audio en vivo desde 0).
  **Causa raíz:** la continuación de `togglePlay` tras el `await` no sabe que el usuario ya pidió
  detener: `stop()` no deja ninguna marca que la invalide.
- **Bug 4 (Low, cosmético) — ▶ desde un hueco suena ~1 fotograma de lo recortado.** Con el cursor
  parado dentro de un hueco borrado (o antes de un principio recortado), ▶ arranca el vídeo y el audio
  en vivo desde el hueco y es el primer tick del bucle (~16 ms después) el que salta al siguiente
  tramo: se oye/ve un instante de lo recortado. Sin audio en vivo suena la mezcla original del
  `<video>` desde el hueco.
  **Causa raíz:** `togglePlay` arranca siempre desde `v.currentTime`; solo reposiciona (D6-BUG-2) si no
  queda nada conservado por delante. Con tramos por delante deja el salto al bucle, que llega un
  fotograma tarde.

## Alcance

**Dentro:**
- `ensureAudioLoaded` aplica los volúmenes y pistas quitadas **vivos** (refs), leídos después del
  `await`.
- `togglePlay` (rama de reproducir) toma un número de intento antes de la carga y no hace nada si, al
  volver, ■ lo invalidó (`stop()` incrementa el contador).
- `togglePlay` generaliza el reinicio: desde cualquier punto fuera de un tramo conservado salta
  primero al destino (siguiente tramo, o el inicio del primero si no queda ninguno) y solo entonces
  arranca el `<video>`; el audio en vivo lo arranca el bucle al aterrizar.
- Tests de regresión y de no-regresión.

**Fuera (explícito):**
- El mismo fotograma cuando el usuario hace seek a un hueco **durante** la reproducción.
- Otras acciones durante la carga (seek de la timeline, cortes): `togglePlay` ya lee el cursor y los
  tramos vivos al volver; no se invalida nada más.
- ❚❚ durante un salto en curso (ver el plan de `fix-editor-avanzado-reproduccion`).

## Criterios de aceptación

- [ ] Un volumen cambiado durante la carga del audio es el que suena al terminar; una pista quitada
      durante la carga no suena.
- [ ] ■ durante «Cargando audio…» deja el editor parado: al terminar la carga no se reproduce el
      vídeo, no se desmutea ni arranca el audio en vivo; ▶ vuelve a estar habilitado y el siguiente ▶
      funciona.
- [ ] ▶ con el cursor en un hueco (o antes de un principio recortado) posiciona vídeo y cursor en el
      siguiente tramo **antes** de `play()`; con audio en vivo, éste arranca una sola vez en ese punto
      cuando el vídeo aterriza; sin audio en vivo, la mezcla original no suena desde el hueco.
- [ ] No hay bucle de saltos: tras aterrizar, el bucle no vuelve a reposicionar.
- [ ] Sin regresiones: salto de huecos durante la reproducción, reinicio desde el final recortado
      (D6-BUG-2), salir durante la carga (D6-BUG-1), ■ anulando el salto pendiente, ▶/❚❚ normales.
- [ ] Suite, type-check y lint verdes.
