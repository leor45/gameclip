# Tasks — Botones laterales del ratón como atajos

## Implementación

- [x] 1. `@shared/hotkeys`: `Mouse4`/`Mouse5`, `accelFromMousePress`, `isMouseAccelerator`,
      `parseMouseAccelerator` (sustituye a `mouseButtonOf`), `isPttReserved` con ratón.
- [x] 2. `GlobalHook` compartido (recuento de usuarios); `PushToTalk` sobre él.
- [x] 3. `MouseHotkeys` (`register`/`unregisterAll`, modificadores exactos).
- [x] 4. `registerHotkeys` reparte teclado/ratón; `teardown` suelta los dos.
- [x] 5. Captura de botones del ratón en Atajos y Avanzado (con aviso para izq/der/central).
- [x] 6. Sin navegación atrás/adelante con el ratón: `mouseup` de los botones 3/4 prevenido en
      `App.tsx` (el `app-command` del main resultó no ser la vía; ver plan).

## Tests unitarios (obligatorios)

- [x] `accelFromMousePress`: botones 3/4 con y sin modificadores; 0/1/2 → null.
- [x] `isValidAccelerator`/`hotkeyCollisions`/`isPttReserved` con `Mouse4`.
- [x] `MouseHotkeys`: dispara con el botón y modificadores exactos; no con otros; `unregisterAll`
      suelta el hook.
- [x] `GlobalHook`: dos usuarios → un `start`; `stop` solo al soltar el último. PTT sigue pasando.
- [x] Renderer: «Editar atajo» + botón lateral asigna `Mouse4`; botón derecho avisa y no asigna.
- [x] Renderer: `mouseup` del botón 3/4 en `App` queda `defaultPrevented` y la ruta no cambia.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`)
- [x] Comprobación con la app real y `SendInput` (2026-10-08): `Mouse4` → clip guardado con la app
      delante y en segundo plano; `Ctrl+Mouse5` → captura, `Mouse5` solo → nada; encender y apagar
      el PTT no deja sin hook a los atajos de ratón.
- [ ] Pulsación con el ratón físico del owner (pendiente de su prueba).
- [x] Comprobación con la app real: Biblioteca → Ajustes y «atrás» (XBUTTON1) → sigue en Ajustes;
      «adelante» con historial disponible → no navega. Sin el `mouseup` prevenido, navegaba.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
