# Tasks — Re-índice automático de juegos instalados

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. `src/shared/games.ts` — constante `UNKNOWN_EXE_REFRESH_COOLDOWN_MS = 30_000`.
- [x] 2. `src/main/capture/game-detector.ts` — en `poll()`: línea base en la primera pasada;
       después, detectar claves nuevas no reconocidas (ni índice, ni curada, ni manuales), con set de
       "vistos" y cooldown, y emitir `'unknown-executable'`. Opción inyectable `unknownRefreshCooldownMs`.
- [x] 3. `src/main/index.ts` — en `setupGameDetection`, suscribir `'unknown-executable'` →
       `void refreshGameIndex()`.

## Tests unitarios (obligatorios)

Camino feliz **y** casos borde. El test de regresión va primero (rojo → verde).

- [x] Regresión: un proceso nuevo no reconocido tras la línea base emite `'unknown-executable'`.
- [x] La primera pasada (línea base) no dispara, aunque haya procesos desconocidos al arrancar.
- [x] Un proceso reconocido (lista curada / índice / manual) no dispara `'unknown-executable'`.
- [x] Un desconocido que ya disparó no vuelve a disparar mientras siga corriendo (set de vistos).
- [x] Cooldown: dos desconocidos nuevos seguidos → un solo emit dentro del cooldown; el pendiente
      dispara al expirar.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 747 pasan
- [ ] Comprobación manual (owner): con la app abierta, lanzar un juego cuyo exe no esté en el índice
      provoca un re-índice y se detecta sin reiniciar.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
