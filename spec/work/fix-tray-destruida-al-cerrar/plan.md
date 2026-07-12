# Plan — "Tray is destroyed" al cerrar la app

> Aprobado por el owner en la sesión (2026-07-12).

## Enfoque

**El cierre sale de `index.ts` a su propio módulo (`src/main/shutdown.ts`) para poder testearlo.**
Hoy el orden del teardown vive dentro de un `app.on('will-quit')`, que no se puede montar en un test
(importar `index.ts` arrastra Electron entero y crea ventanas). Extraerlo a una función sobre sus
dependencias —`{ capture, tray, overlay, api, … }`, todas con interfaces mínimas— permite reproducir
el bug con dobles: una captura falsa cuyo `shutdown()` emite el `status` final, y una bandeja falsa
que lanza `Tray is destroyed` si la tocan después de destruirla. Con el orden actual ese test es
rojo; con el nuevo, verde. Es exactamente el bug, no una aproximación.

`teardown()` ordena el cierre por **dirección de los eventos**: primero lo que *emite* (hotkeys, PTT,
timers, detector, captura), después lo que *escucha* (overlay, bandeja) y por último la API. Cada
paso va en su propio `try/catch` que registra y sigue: en el cierre, un fallo aislado no puede dejar
libobs y el puerto de la API colgados, que es justo lo que pasa hoy.

**La bandeja además se defiende.** El orden correcto arregla *este* camino, pero cualquier evento
tardío (un `status` en vuelo, un `setTimeout` pendiente) volvería a romperla. `setRecording()` pasa a
no hacer nada si el `Tray` ya está destruido, y `destroy()` se vuelve idempotente. Las dos capas
sirven: sin el orden, la app se cierra bien por accidente; sin la guarda, vuelve a romperse en cuanto
alguien agregue un emisor.

## Archivos / módulos afectados

- `src/main/shutdown.ts` *(nuevo)* — `teardown(partes)`: el orden del cierre, aislado y testeable.
- `src/main/index.ts` — `will-quit` pasa a llamar a `teardown()`; las referencias (`tray`, `overlay`,
  `capture`…) se anulan después, para que un evento tardío no encuentre nada a lo que pegarle.
- `src/main/tray.ts` — `setRecording()` no toca un `Tray` destruido; `destroy()` idempotente.
- `src/main/__tests__/shutdown.test.ts` *(nuevo)* — el test de regresión (rojo → verde).
- `src/main/__tests__/tray.test.ts` *(nuevo)* — con `vi.mock('electron')`: un `Tray` falso que imita a
  Electron y lanza si lo tocan destruido. Es el primer mock de Electron del repo.

## Decisiones y alternativas consideradas

- **Extraer el teardown** — descartado testear `index.ts` directamente (imposible sin Electron), y
  descartado "arreglar el orden y confiar": sin test, la próxima reordenación revive el bug.
- **Guarda en la bandeja *además* del orden** — descartado elegir una sola. El orden es la causa
  raíz; la guarda es lo que evita que el mismo error vuelva por otro camino.
- **`try/catch` por paso** — descartado uno global: envolver todo el cierre en un solo `try` evitaría
  el diálogo pero seguiría saltándose los pasos posteriores al que falle (que es como hoy la API
  queda sin cerrar). El objetivo es que el cierre **termine**, no solo que no grite.

## Riesgos

- **Bajo.** El cambio es de orden y de guardas; no toca la captura ni la lógica de negocio.
- El único riesgo real es que apagar la captura *antes* que el overlay haga que este reciba un último
  `status` y parpadee al cerrar. No debería: `shutdown()` emite `idle`, y con `idle` el overlay se
  oculta. Se comprueba a mano cerrando la app.

---

**Estado:** ✅ aprobado el 2026-07-12
