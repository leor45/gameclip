# Tasks — Botones laterales del ratón como atajos

## Implementación

- [ ] 1. `@shared/hotkeys`: `Mouse4`/`Mouse5`, `accelFromMousePress`, `isMouseAccelerator`,
      `mouseButtonOf`, `isPttReserved` con ratón.
- [ ] 2. `GlobalHook` compartido (recuento de usuarios); `PushToTalk` sobre él.
- [ ] 3. `MouseHotkeys` (`register`/`unregisterAll`, modificadores exactos).
- [ ] 4. `registerHotkeys` reparte teclado/ratón; `teardown` suelta los dos.
- [ ] 5. Captura de botones del ratón en Atajos y Avanzado (con aviso para izq/der/central).

## Tests unitarios (obligatorios)

- [ ] `accelFromMousePress`: botones 3/4 con y sin modificadores; 0/1/2 → null.
- [ ] `isValidAccelerator`/`hotkeyCollisions`/`isPttReserved` con `Mouse4`.
- [ ] `MouseHotkeys`: dispara con el botón y modificadores exactos; no con otros; `unregisterAll`
      suelta el hook.
- [ ] `GlobalHook`: dos usuarios → un `start`; `stop` solo al soltar el último. PTT sigue pasando.
- [ ] Renderer: «Editar atajo» + botón lateral asigna `Mouse4`; botón derecho avisa y no asigna.

## Verificación (gates)

- [ ] Type-check verde (`npm run typecheck`)
- [ ] Lint verde (`npm run lint`)
- [ ] Tests verdes (`npm run test`)
- [ ] Comprobación manual: atajo «Guardar clip» en `Mouse4`, app en segundo plano, pulsación real
      (y sintética con `SendInput` XBUTTON1) → clip guardado; `Ctrl+Mouse4` solo con Ctrl.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
