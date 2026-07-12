# Tasks — Editor: pistas de audio por nombre (exportar y guardar edit)

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. `src/shared/tracks.ts`: tipos (`ClipAudioTrack`, request/result de guardar edit) y
      helpers puros (pistas seleccionables, clave/etiqueta, pistas activas, normalización IPC).
- [x] 2. `src/main/export/spawn.ts`: extraer `FfmpegProcess` / `SpawnFfmpeg` (hoy en `manager.ts`)
      para reusarlos en el sondeo y en guardar edit.
- [x] 3. `src/main/export/probe.ts`: `parseAudioTracks` (pura, sobre el stderr de `ffmpeg -i`) y
      `probeAudioTracks` (spawn).
- [x] 4. `src/main/export/ffmpeg-args.ts`: mapeo explícito de audio en el MP4 (`-an` / `-map` /
      `amix normalize=0`).
- [x] 5. `src/main/export/audio-edit.ts`: `buildAudioEditArgs` (pura) y `runAudioEdit`
      (temporal + rename atómico).
- [x] 6. `ExportManager`: métodos `probeTracks` y `saveAudioEdit` (reusan su `spawnFn`).
- [x] 7. Catálogo: migración `muted_tracks`, `mutedTracks` en `Clip`, `setAudioEdit` en el
      repositorio y en `LibraryManager`.
- [x] 8. IPC + preload: canales `clip:get-audio-tracks` y `clip:save-audio-edit`, `ExportRequest`
      con `mutedTracks`, y `window.gameclip.editor`.
- [x] 9. Editor: lista de pistas con checkbox, botón **Guardar edit** y recarga del reproductor
      tras guardar; estilos.

## Tests unitarios (obligatorios)

Camino feliz **y** casos borde. Si es un Fix: el test de regresión va primero (rojo → verde).

- [x] `tracks.test.ts` — pistas seleccionables con y sin layout por rol; pistas activas según
      muteadas; normalización de un request inválido.
- [x] `probe.test.ts` — parseo de una salida real de `ffmpeg -i` (5 pistas nombradas); clip de una
      sola pista sin nombre; handler genérico (`SoundHandler`) no cuenta como nombre.
- [x] `ffmpeg-args.test.ts` — sin pistas marcadas → `-an`; una pista → `-map 0:a:N`; varias →
      `amix=inputs=N:normalize=0`; GIF sin cambios.
- [x] `audio-edit.test.ts` — args: mezcla de las marcadas en la pista 1, todas las de rol copiadas
      y renombradas, video `-c copy`; 0 marcadas → pista 1 silenciada; rename atómico y clip
      íntegro si ffmpeg falla.
- [x] `clips-repository.test.ts` — migración sobre una DB existente; `setAudioEdit` guarda
      nombres muteados y tamaño.
- [x] `editor.test.tsx` — lista de pistas por nombre; exportar manda `mutedTracks`; guardar edit
      llama al canal y refresca el reproductor; clip sin pistas por rol → botón deshabilitado.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`)
- [x] Comprobación manual E2E: clip real con pistas por rol → desmarcar `mic` → exportar (el MP4
      sale con una pista sin mic) → guardar edit (el clip original conserva sus pistas y su
      mezcla ya no lleva mic) → volver a marcar y guardar (mezcla restaurada).

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
