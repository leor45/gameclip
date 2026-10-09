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

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
