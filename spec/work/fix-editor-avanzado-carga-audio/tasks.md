# Tasks — Editor avanzado: carga del audio (volumen, ■ y ▶ desde un hueco)

## Tests unitarios (obligatorios; primero, en rojo)

- [x] Regresión (Bug 2): volumen cambiado durante «Cargando audio…» → suena el nuevo al terminar.
- [x] Regresión (Bug 2): pista quitada durante «Cargando audio…» → no suena al terminar.
- [x] No-regresión: volumen/pista quitada antes del ▶ se aplican; con el motor cargado, restaurar y
      subir volumen suenan en el acto.
- [x] Regresión (Bug 3): ■ durante «Cargando audio…» → al terminar no se reproduce, no se desmutea, no
      arranca el audio en vivo; ▶ se rehabilita y el siguiente ▶ funciona sin recargar.
- [x] Regresión (Bug 3): ▶ ■ ▶ con la carga en curso → un solo arranque.
- [x] No-regresión: mover el cursor durante la carga → el ▶ arranca desde la posición nueva.
- [x] Regresión (Bug 4): ▶ desde un hueco, con audio en vivo → salta antes de `play()`, el audio no
      arranca mientras el vídeo busca y arranca una sola vez al aterrizar; sin bucle de saltos.
- [x] Regresión (Bug 4): ▶ desde un hueco, sin audio en vivo → `play()` parte del destino.
- [x] Regresión (Bug 4): ▶ desde 0 con el principio recortado → salta al primer tramo antes de `play()`.
- [x] Bordes de `segmentAt`: `t = end` salta al siguiente tramo; `t = start` no reposiciona.
- [x] No-regresión: ■ tras ▶ desde un hueco y ▶ otra vez; ripple durante la reproducción; ▶ en mitad
      de un tramo; reinicio desde el final recortado (D6-BUG-2); salir durante la carga (D6-BUG-1).

## Implementación

- [x] 1. `volumesRef`/`removedRef`; `ensureAudioLoaded` los lee tras el `await`.
- [x] 2. `playAttemptRef`: `togglePlay` lo comprueba tras la carga; `stop()` lo incrementa.
- [x] 3. `togglePlay`: `reinicio` → `salto` (destino = siguiente tramo, o el inicio del primero).

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes (91 archivos, 1225 tests)

## Cierre

- [x] Aprobación del owner
- [ ] *(No hecha: la cubren los 13 tests jsdom nuevos; queda pendiente de probar a mano.)*
      Comprobación manual en la app: mover un volumen durante «Cargando audio…», ■ durante la carga
      y ▶ con el cursor parado en un hueco (con y sin audio en vivo)
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md`: entrada entregada en la tanda D y quitar los hallazgos 2, 3 y 4
      de «Hallazgos preexistentes de la tanda D» (se hace en la integración para no pisar otras ramas)
