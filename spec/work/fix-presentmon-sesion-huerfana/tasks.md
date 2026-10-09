# Tasks — Parar PresentMon deja su sesión ETW huérfana

## Tests unitarios (obligatorios; primero, en rojo)

- [x] Regresión: `stop()` con proceso vivo → kill y después `closeSession` con
      `--terminate_existing_session --session_name GameClipPerf`.
- [x] Sin proceso vivo, `stop()` no lanza nada.
- [x] Un fallo de `closeSession` no rompe `stop()`.

## Implementación

- [x] 1. Constante de sesión + `presentMonTerminateArgs()`.
- [x] 2. `closeSession` en las dependencias y en `stop()`.
- [x] 3. `realPresentMonCloseSession` con `spawnSync` y tope.

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes
- [x] Medido el flag real: `--terminate_existing_session` sobre una sesión inexistente tarda ~35 ms
      (exit 7, «no existing sessions found»).
- [ ] Comprobación con `logman query -ets` de que `GameClipPerf` desaparece al apagar el overlay:
      exige consola elevada (sin elevación ni PresentMon abre la sesión ni logman la lista).

## Cierre

- [x] Aprobación del owner
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
