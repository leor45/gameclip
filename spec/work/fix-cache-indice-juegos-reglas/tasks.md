# Tasks — La caché del índice de juegos ignora los cambios de reglas y el «Volver a escanear»

## Tests unitarios (obligatorios; primero, en rojo)

- [x] Regresión: caché con la huella del formato anterior (bytes exactos) → re-indexa y quita
      `qtwebengineprocess` (rojo con el `index.ts` anterior, comprobado).
- [x] `refresh({ force: true })` re-escanea con la misma huella.
- [x] Un forzado lanzado durante un refresco en curso no se pierde.

## Implementación

- [x] 1. `SCAN_RULES_VERSION` en `scan.ts`.
- [x] 2. Huella con versión + `refresh({ force })` en `GameIndexService`.
- [x] 3. `rescan` del IPC forzado.

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes

## Ampliación (tanda D, D1-BUG-1)

### Tests de regresión (primero, en rojo; comprobado contra el `index.ts` anterior)

- [x] Una exclusión guardada durante un rescan forzado se aplica al terminar.
- [x] Un forzado que llega con un refresco normal en cola lo vuelve forzado (no se degrada).
- [x] Varias peticiones durante un refresco en curso → UN solo refresco más (cuenta de
      `listInstalledGames`).
- [x] Una petición que llega con la cola ya corriendo programa otra.
- [x] Una petición justo al terminar el refresco en curso se suma a la cola (nunca dos a la vez).
- [x] Si el refresco en curso falla, el de la cola corre igual.
- [x] «Sincronizar» llama a `rescan({ force: false })`; «Volver a escanear» sigue sin opciones (forzado).
- [x] `normalizeRescanForce`: solo `{ force: false }` desactiva el forzado.

### Implementación

- [x] 1. Cola única de refresco en `GameIndexService.refresh()` (+ `lanzar`).
- [x] 2. `normalizeRescanForce` en `src/shared/games.ts`.
- [x] 3. `rescan(options?)` en `GamesApi`, preload, IPC del main y `main/index.ts`.
- [x] 4. «Sincronizar» pide `{ force: false }`.

### Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
