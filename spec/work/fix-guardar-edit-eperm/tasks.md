# Tasks — Fix: "Guardar edit" falla con EPERM al reemplazar el clip

## Implementación

- [x] 0. Reproducir la causa raíz aislada (`fs`): rename sobre destino cerrado ✓; con un handle
      abierto sobre el destino → **EPERM**; al cerrarlo, el mismo rename funciona.
- [x] 1. Test de regresión primero (rojo): un rename que da EPERM y luego funciona debe aplicar el edit.
- [x] 2. `renameWithRetry` en `audio-edit.ts`: reintentos con backoff ante EPERM/EACCES/EBUSY y
      mensaje en español si el bloqueo persiste. `deps` inyectables (`rename`, `sleep`).
- [x] 3. `Editor.tsx`: `soltarVideo()` (pause + quitar `src` + `load()`) antes de pedir el guardado.
- [x] 4. `Editor.tsx`: recargar el reproductor al terminar, con éxito **o con error** (si no, tras un
      fallo quedaría en negro).

## Tests unitarios (obligatorios)

- [x] Regresión: rename bloqueado una vez (EPERM) → se reintenta y el edit se aplica (rojo → verde).
- [x] Borde: bloqueo persistente → error en español, clip intacto y sin temporal huérfano.
- [x] Editor: el `<video>` ya no tiene `src` cuando se invoca `saveAudioEdit`.
- [x] Editor (borde): tras un error, el reproductor vuelve a cargar el clip.
- [x] Los tests previos del edit siguen verdes (rename normal, fallo de ffmpeg, limpieza del temporal).

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 387
- [ ] Comprobación manual del owner: guardar el edit de un clip de juego con el reproductor cargado.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
