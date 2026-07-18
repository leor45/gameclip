# Tasks — FPS solo cuando hay un juego, «—» en el escritorio

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

> **Release:** mismo release que `feature/overlay-rendimiento` y
> `feature/overlay-proteccion-selectiva`.

## Implementación

- [x] 1. `parseCsvHeader`: localizar también `presentmode`, como columna **opcional** (si falta, se
      devuelve `null` en ese campo, no se invalida la cabecera entera — ver riesgos del plan).
- [x] 2. `FpsTracker` (o el mapa de trackers): marca `calificado`, que se enciende una vez y no se
      apaga mientras el tracker viva.
- [x] 3. `onLine`: leer el modo y calificar el tracker si empieza por `Hardware`. Constante con el
      prefijo, comentada con el porqué del prefijo y no la subcadena.
- [x] 4. `PresentMonReader.setDetectedGame(exe | null)`: segunda vía de calificación. Solo enciende.
- [x] 5. `fps()`: iterar solo sobre trackers calificados; sin ninguno → `null`.
- [x] 6. `PerfSampler`: reexponer `setDetectedGame` hacia el reader.
- [x] 7. `src/main/index.ts`: avisar al sampler cuando cambia el juego detectado.

## Tests unitarios (obligatorios)

Camino feliz **y** casos borde.

- [x] `parseCsvHeader` localiza `PresentMode` en la cabecera real de la 2.5.1 (posición 7).
- [x] Cabecera **sin** `PresentMode`: no invalida el parseo; se degrada a "todo califica" (el
      comportamiento de la Fase 19) en vez de morir.
- [x] Solo apps de escritorio presentando (`Composed: Flip`) → `fps()` es `null`.
- [x] Un juego en `Hardware: Independent Flip` califica y muestra sus FPS **sin estar detectado**.
- [x] Enganchado en modo `Hardware…`, si pasa a `Composed: Flip` (DWM lo degrada) **conserva** el
      contador — no se recalifica por lectura.
- [x] Un proceso **no** calificado no roba el enganche por mucho que supere el `MARGEN_CAMBIO`.
- [x] `setDetectedGame('emu.exe')` califica a un proceso que solo presenta en `Composed: Flip`;
      `setDetectedGame(null)` lo deja de calificar de cara a los nuevos.
- [x] Regresión Fase 19: el caso Discord, el re-enganche y el segundo plano siguen verdes con las
      filas marcadas en su modo real.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`)
- [ ] Comprobación manual (owner, requiere sesión elevada): escritorio con Discord abierto → «—» en
      FPS y el resto de métricas vivas; juego sin bordes no detectado → FPS correctos; alt+tab → los
      conserva; emulador en ventana añadido a mano → FPS; DLSS FG → sigue coincidiendo con Steam.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
- [ ] **Release** con las notas de las tres ramas (`feature/overlay-rendimiento` + esta +
      `feature/overlay-proteccion-selectiva`)
