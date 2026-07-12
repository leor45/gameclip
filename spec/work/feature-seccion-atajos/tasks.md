# Tasks — Sección Atajos

## Implementación

- [x] 1. `src/shared/hotkeys.ts` (nuevo): catálogo `HOTKEY_ACTIONS`, `isHotkeyActive`,
      `accelFromKeyPress`, `isValidAccelerator`, `hotkeyCollisions`, `isPttReserved`.
- [x] 2. `src/shared/capture.ts`: `recordingHotkey` (default `F7`) con su normalización.
- [x] 3. `src/main/index.ts`: `registerHotkeys()` itera el catálogo, descarta colisiones con la
      lógica compartida y registra la acción nueva (toggle grabar/detener según el estado).
- [x] 4. `src/shared/overlay.ts`: el aviso in-game anuncia también el atajo de grabación.
- [x] 5. `src/renderer/views/ajustes/Atajos.tsx` (nuevo): lista por acción, captura de la pulsación
      (Esc cancela), colisiones marcadas, tecla del PTT reservada, restablecer defaults.
- [x] 6. `SeccionForm`: prop `bloqueo` que deshabilita el guardado con su motivo.
- [x] 7. Alta de la sección: `AjustesLayout.tsx` + ruta en `App.tsx`.
- [x] 8. `HotkeyInfo.tsx` (nuevo): atajo solo lectura + enlace; usado en General y Grabación.
- [x] 9. `styles.css`: `.hotkey-list` / `.hotkey-row` / `.hotkey-key` / `.hotkey-info-inline`.

## Tests unitarios (obligatorios)

- [x] `hotkeys.test.ts`: aceleradores con modificadores, solo-modificadores → null, teclas no
      soportadas → null, validación, colisiones (incl. acciones apagadas), PTT reservado.
- [x] `atajos.test.tsx`: lista con las teclas actuales, captura de `Alt+C`, `Esc` cancela, tecla del
      PTT rechazada, colisión bloquea el guardado, restablecer defaults.
- [x] `ajustes.test.tsx`: en General el atajo se muestra y ya no se edita (enlace a Atajos).
- [x] `overlay.test.ts`: el aviso incluye la fila de grabación.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 458 pasando
- [x] E2E en máquina real: la sección carga con las cuatro acciones y sus teclas reales (F8 · F7 ·
      F6 · F10); **pulsar F7 arrancó la grabación y el segundo F7 la cortó y guardó el clip**.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
