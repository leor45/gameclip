# Tasks — Pistas de escritorio: mezcla + PC + micrófono

## Implementación

- [x] 1. `obs.ts`: rama `desktop + separadas` de `audioTrackLayout()` → T1 `default`, T2 `pc`
      (`PC_TRACK_NAME`), T3 `mic`; `desktopMask = T1|T2`, `micMask = T1|T3`, `named: true`.
- [x] 2. `Editor.tsx`: la leyenda del clip sin pistas por rol pasa a decir "se grabó en modo
      escritorio con un solo audio (o antes de que existieran las pistas por rol)".

## Tests unitarios (obligatorios)

- [x] `audioTrackLayout('desktop', true, [])`: T1/T2/T3 con nombres y `named: true`.
- [x] `effectiveCapture` + layout: escritorio con `desktopAudioTracks: 'separate'` produce el
      layout por rol.
- [x] `tracks.ts`: un clip `[default, pc, mic]` es layout por rol, ofrece `pc` y `mic`, y muteando
      `mic` la mezcla se rehace solo con `pc`.
- [x] Editor: un clip `[default, pc, mic]` deja guardar edit; uno de una sola pista muestra la
      leyenda nueva.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 436 pasando
- [x] E2E en máquina real: clip de escritorio con pistas separadas → 3 pistas nombradas
      (`default` · `pc` · `mic`), con el tono del PC aislado en `pc` (−28,6 dB) y el micro en su
      propia pista (−79,2 dB, habitación en silencio).

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
