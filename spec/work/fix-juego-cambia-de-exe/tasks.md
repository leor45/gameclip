# Tasks — Si un juego pasa de su lanzador al exe real, la captura no le sigue

## Tests unitarios (obligatorios; primero, en rojo)

- [x] Regresión (detector): lanzador → lanzador + real → real emite el relevo, sin emisión mientras
      conviven.
- [x] Regresión (detector): el exe es pegajoso aunque `tasklist` cambie el orden o la capitalización.
- [x] Regresión (detector): con varios juegos, el relevo de uno emite la lista completa.
- [x] Regresión (detector): el pegajoso suelta un exe que el re-índice ya no reconoce como ese juego.
- [x] Guarda (detector): nunca un mismo exe bajo dos juegos; sin cambios no hay emisión.
- [x] Regresión (manager): perfil de juego → `updateGameCaptureTarget('real.exe')`, sin rebuild, buffer
      intacto, `detectedGame` sin cambios.
- [x] Regresión (manager): modo auto grabando → la sesión no se corta ni se rearranca.
- [x] Regresión (manager): `apps` religa el audio; `desktop` no lo toca.
- [x] Regresión (manager): grabación manual en curso → re-apuntado en caliente, el clip sigue entero.
- [x] Regresión (manager): el bucle de re-apuntado se rearranca con el exe nuevo.
- [x] Guardas (manager): perfil de escritorio no re-apunta; misma exe con otra capitalización no es
      un cambio; rebuild aplazado por grabación nace con el exe nuevo.

## Implementación

- [x] 1. Detector: `keepExecutables` (pegajoso) y `setChanged` por nombre y ejecutable.
- [x] 2. Manager: `exeChanged` en `applyActiveGame`, re-apuntado con `changed || exeChanged` y
      `startAimRetries()` en el cambio de exe.

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes

## Cierre

- [x] Aprobación del owner
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
