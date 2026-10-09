# Tasks — Fallos menores de la biblioteca y del editor avanzado

## Tests de regresión (primero, en rojo)

- [x] Biblioteca: abrir ✎ en una tarjeta, escribir, disparar `library:changed` → el input conserva lo escrito.
- [x] Biblioteca: primer clip pendiente cuya miniatura falla → se pide `setMedia` del siguiente pendiente.
- [x] Editor avanzado: clip con `durationSeconds: null`, cargar metadata del vídeo sin tocar nada → no se guarda borrador y «Restablecer» deshabilitado.
- [x] Editor avanzado: borrador con 2 segmentos de un clip con `durationSeconds: null` → tras cargar metadata siguen los 2 segmentos.

## Implementación

- [x] 1. `ClipCard`: dependencias por valor y sin realinear mientras se edita.
- [x] 2. `useThumbnailer`: ids fallidos saltados y nueva pasada.
- [x] 3. `EditorAvanzado`: base a la duración real; no pisar un borrador restaurado.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`)
- [x] Comprobación manual: renombrar un clip mientras se guarda un replay; abrir un clip recién guardado en el editor avanzado y salir → no aparece en «Ediciones sin terminar».

## Cierre

- [x] Aprobación del owner
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
