# Tasks — El escaneo de la biblioteca cataloga los temporales de ffmpeg

## Tests unitarios (obligatorios; primero, en rojo)

- [x] `isTempMediaFile` reconoce los dos temporales y no un clip normal.
- [x] Regresión: `reconcile` ignora los temporales de la carpeta.

## Implementación

- [x] 1. Constante y helper en `@shared/library`.
- [x] 2. `track-names.ts` y `audio-edit.ts` usan la constante.
- [x] 3. `mediaFilesIn` salta los temporales.

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes

## Cierre

- [x] Aprobación del owner
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
