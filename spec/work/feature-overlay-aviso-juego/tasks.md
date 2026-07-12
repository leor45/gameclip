# Tasks — Aviso del overlay al detectar el juego

## Implementación

- [x] 1. `@shared/overlay` (nuevo): `OverlayNotice`, `describeReplayDuration(seconds)` y
      `buildGameNotice(settings)` — puros, testeables sin Electron ni libobs.
- [x] 2. `OverlayState.notice` en el contrato IPC.
- [x] 3. `OverlayController.showNotice()` con su temporizador (6 s) y ventana más alta (340×220).
- [x] 4. `OverlayController.sync()`: al quedarse sin nada que mostrar, manda el estado vacío y oculta
      la ventana un instante después — esconderla ya se comería la animación de salida.
- [x] 5. `index.ts`: dispara el aviso en la **transición** sin-juego → juego (no en cada status).
- [x] 6. `Overlay.tsx`: pinta el aviso y, al llegar `notice: null`, lo anima saliendo y lo desmonta
      con `onAnimationEnd`.
- [x] 7. CSS: keyframes de entrada (desde arriba) y de salida (hacia arriba), filas de hotkeys.
- [x] 8. (Ajuste del owner) Overlay en **dos ventanas**: aviso + toast arriba a la izquierda, REC
      arriba a la derecha. Cada una recibe el estado filtrado (`overlayStateFor`, puro).
- [x] 9. (Ajuste del owner) El toast adopta la tarjeta del aviso (`.overlay-card`), con la misma
      animación de entrada y salida.

## Tests unitarios (obligatorios)

- [x] `describeReplayDuration`: 30 s, 1 minuto, minuto y medio, 2 minutos.
- [x] `describeReplayDuration` (borde): un valor no redondo cae a segundos.
- [x] `buildGameNotice`: usa las hotkeys realmente configuradas (replay en F9 → dice F9).
- [x] `buildGameNotice`: la fila del clip refleja la duración del buffer.
- [x] `buildGameNotice` (borde): capturas desactivadas → sin esa fila.
- [x] `buildGameNotice` (borde): modo `off` → sin aviso.
- [x] `buildGameNotice` (borde): sin ninguna hotkey activa → sin aviso.
- [x] Overlay: pinta título y una fila por hotkey.
- [x] Overlay: al quitarlo, se anima la salida y solo entonces se desmonta.
- [x] Overlay (borde): un aviso nuevo mientras el anterior sale cancela la salida.
- [x] `overlayStateFor`: la esquina izquierda pinta los avisos y no el REC; la derecha, al revés.
- [x] Overlay: el toast usa la tarjeta del aviso y también anima su salida antes de desmontarse.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 383
- [ ] Comprobación manual: abrir un juego (borderless o ventana) y ver el aviso entrar y salir solo.
      En **fullscreen exclusivo no se verá**: limitación conocida del overlay, anotada en el roadmap
      como tarea futura (inyección tipo Discord).

## Cierre

- [x] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
