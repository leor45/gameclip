# Tasks — El clip sale negro en perfil de juego

## Implementación

- [x] 1. Diagnóstico con sonda en máquina real (juego corriendo): `game_capture` con `::<exe>` →
      0×0 (negro); con la cadena completa `título:clase:exe` → 2560×1440 (captura).
- [x] 2. `resolveGameWindow(items, exe)` en `obs.ts`: resuelve la ventana contra la propiedad-lista
      `window` del propio source (mismo patrón que `resolveMonitorId`).
- [x] 3. `gameCaptureSettings(settings, gameWindow)` pasa a recibir la ventana ya resuelta; sin
      ventana, `any_fullscreen` (nunca apuntar a una ventana inexistente).
- [x] 4. `buildPipeline()` crea el game capture y lo apunta (`aimGameCapture`) tras leer su lista.
- [x] 5. `updateGameCaptureTarget(exe, settings)` resuelve igual al rotar de juego.

## Tests unitarios (obligatorios)

- [x] **Regresión (primero, rojo → verde)**: `resolveGameWindow` con los items REALES de la máquina
      del bug devuelve la cadena completa de `MilesMorales.exe`, y `gameCaptureSettings` nunca emite
      `window: '::<exe>'`.
- [x] Caso borde: sin ejecutable, ejecutable no listado o lista vacía → null → `any_fullscreen`.
- [x] Match case-insensitive y solo contra el campo `exe` de la cadena.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 462 pasando
- [x] E2E en máquina real con *Marvel's Spider-Man: Miles Morales* corriendo: el clip del perfil de
      juego **muestra el juego** (frame extraído; `blackdetect` no encuentra negro, brillo medio
      YAVG 30,9 y picos 238 — un clip negro daría 16 fijo) y no aparece nada del escritorio.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
