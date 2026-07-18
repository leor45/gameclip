# Tasks — El overlay de rendimiento sale en capturas externas

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

> **Release:** 0.9.0, junto a las otras cuatro tareas del overlay.

## Implementación

- [x] 1. `src/shared/capture.ts`: función pura `needsContentProtection(profile, capturing)`.
- [x] 2. `CaptureManager`: método privado que recalcula el estado y lo emite solo al cambiar.
- [x] 3. Llamarlo desde `rebuildPipeline()` (tras fijar `builtProfile`), `startBuffer`/`stopBuffer`,
      `doStartRecording`/`doStopRecording` y `shutdown()`.
- [x] 4. Orden seguro: proteger **antes** de arrancar la salida, desproteger **después** de pararla.
- [x] 5. `src/main/index.ts`: puentear el evento al `PerfOverlayController`.
- [x] 6. `PerfOverlayController.setCaptureProtection(boolean)` con guarda de "solo si cambió"; la
      ventana se sigue creando **protegida**.
- [x] 7. Reaplicar `setAlwaysOnTop('screen-saver')` tras cada cambio. **Se conserva pese a que la
      sonda no detectó el problema**, ver la nota de verificación: `isAlwaysOnTop()` confirma la
      bandera de Electron pero **no** el nivel Win32, así que la sonda no puede descartar el riesgo.

## Tests unitarios (obligatorios)

- [x] `needsContentProtection`: matriz completa perfil (`game`/`desktop`/`none`) × capturando (sí/no).
- [x] El manager emite al detectarse un juego (desprotege) y al cerrarse (vuelve a proteger).
- [x] Con perfil `none` no se protege.
- [x] **No** emite si el valor no cambió (en escritorio ya nace protegido: no hay nada que emitir).
- [x] `shutdown()` deja el estado en "sin proteger".

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes — **872** (864 de partida, +8)
- [x] **Riesgo principal del plan, medido sobre una `BrowserWindow` real:** conmutar
      `setContentProtection` (ida, vuelta y 10 veces seguidas) **no** altera topmost, visibilidad,
      geometría ni destruye la ventana. *Limitación de la sonda: `isAlwaysOnTop()` devuelve la
      bandera, no el nivel `screen-saver`; por eso la mitigación se queda puesta.*
- [x] **E2E con captura GDI real** (la misma vía que un recorte de Windows o el compartir pantalla de
      Discord), sobre la zona del overlay:
      1. Escritorio + búfer corriendo → **overlay ausente** (protegido, como siempre).
      2. Juego detectado (`Terraria.exe` falso) → **overlay VISIBLE**, se lee «FPS — GPU 18 % Temp G…».
         Es el objetivo de la feature.
      3. Juego cerrado → escritorio otra vez → **overlay ausente**. El ciclo cierra.
- [x] **Clip real de escritorio** (vía `GAMECLIP_SELFTEST=recording`): el fotograma extraído muestra
      el escritorio y sus iconos y **no** el overlay. La dirección peligrosa —que desproteger filtre
      el overlay a un clip— no se produce.

## Pendiente de la E2E del owner (no se pudo probar aquí)

- [ ] **Clip real con un juego real**, con el overlay ya desprotegido. Es el único criterio que un
      juego falso no puede validar: `cmd.exe` renombrado no tiene swapchain que enganchar, así que el
      `game_capture` no captura nada real. El argumento de diseño (el `game_capture` solo ve la
      swapchain del juego, no una ventana ajena) es la base de la feature, pero **conviene confirmarlo
      con un juego de verdad antes de publicar**.
- [ ] Que REC / clip guardado / aviso de juego sigan dibujándose **por encima** del overlay tras las
      conmutaciones.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado — **5 de 5: la release 0.9.0 queda completa**
