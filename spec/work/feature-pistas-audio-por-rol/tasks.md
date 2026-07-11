# Tasks — Pistas de audio por rol, ordenadas y nombradas

> Se detallan al aprobar el plan (`plan.md`). Esbozo del orden previsto:

## Implementación (tras OK del plan)

- [ ] 1. Test (rojo) del helper de reparto por rol y de `appTrackName`.
- [ ] 2. Helper de reparto + `buildAudioSources` creando pistas nombradas (verde).
- [ ] 3. Tope de 3 apps con audio: constante + normalización + test.
- [ ] 4. Aviso/límite en la UI de ajustes de audio + test.
- [ ] 5. Remux de nombres con ffmpeg tras `wrote` (manual + replay buffer).

## Verificación (gates)

- [ ] Type-check · Lint · Tests verdes.
- [ ] E2E máquina real: 5 pistas nombradas en orden, mezcla en la 1, cada rol aislado.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada
- [ ] `roadmap.md` actualizado
