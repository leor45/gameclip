# Plan — Reasignar el monitor de escritorio al encender la pantalla

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

El pipeline resuelve el display objetivo solo cuando se construye; se le añade un **disparador
externo**: los eventos de `screen` del proceso main. El manager expone un método que recalcula el
display objetivo y decide si hace falta reconstruir.

1. **`CaptureManager` recuerda el display con el que construyó** (`builtDisplay: DisplayInfo | null`,
   asignado en `rebuildPipeline` junto a `builtProfile`).
2. **Método nuevo `displaysChanged()`** (público, sin argumentos): resuelve el display objetivo con la
   misma lógica de `rebuildPipeline` (`displayByIndex(screenMonitorIndex) ?? primaryDisplay`) y:
   - si es igual al `builtDisplay` (misma `width/height/x/y`) → no hace nada;
   - si hay grabación en curso → `pendingRebuild = true` (lo recoge `settleAfterRecording`);
   - si no → `queueRebuild()` (misma cola que usa `setSettings`, sin carreras).
   La resolución del display se extrae a un helper privado `resolveTargetDisplay()` usado por los dos
   caminos, para que no puedan divergir.
3. **Cableado en `src/main/index.ts`**: tras crear el manager, suscribir `display-added`,
   `display-removed` y `display-metrics-changed` a un `displaysChanged()` **debounceado ~2 s**.
   Encender un monitor dispara varios eventos y Windows reporta geometrías transitorias; el debounce
   deja que la topología se asiente y evita reconstruir dos veces.

Notas de comportamiento que salen gratis con este enfoque: apagar el monitor seleccionado también
dispara la reasignación (fallback), y el rebuild re-resuelve además el lienzo base
(`computePipelineSizes`), que también depende del display.

## Ampliación aprobada (2026-07-26): overlay de avisos

Misma causa raíz, otro sitio: `OverlayController.createWindow` calcula la esquina con el `workArea`
del primario **al crear la ventana**, y las ventanas se reutilizan (solo se ocultan). Enfoque idéntico
al del overlay de rendimiento, que no sufre el bug porque recalcula en cada `sync()`:

1. Helper puro `overlayWindowPosition(zone, workArea, win, margin)` en `src/shared/overlay.ts`
   (gemelo de `perfWindowPosition`), testeable sin Electron.
2. `syncZona` recoloca (`setBounds`) **en cada aparición**, antes de mostrar.
3. `OverlayController.reposition()` para las ventanas ya visibles, llamado desde el mismo handler
   debounceado de cambios de monitores: si no, el REC de una grabación en curso se quedaría en el
   monitor viejo hasta ocultarse.

## Archivos / módulos afectados

- `src/main/capture/manager.ts` — campo `builtDisplay`, helper `resolveTargetDisplay()`, método
  público `displaysChanged()`; `rebuildPipeline` guarda el display usado.
- `src/main/index.ts` — suscripción a los tres eventos de `screen` con debounce, y limpieza de los
  listeners/timer al cerrar (junto al resto del teardown de la app).
- `src/main/__tests__/capture-manager.test.ts` — tests nuevos (ver abajo).
- `src/shared/overlay.ts` + `src/shared/__tests__/overlay.test.ts` — helper puro `overlayWindowPosition`
  y sus tests (ampliación).
- `src/main/overlay.ts` — `colocar()` privado, recolocado en `syncZona` y `reposition()` público
  (ampliación).

## Tests (regresión primero)

Sobre el `FakeObs` ya existente, con un `displayByIndex` controlable desde el test:

1. **Reproduce el bug:** `screenMonitorIndex: 0`, `displayByIndex` devuelve `null` (monitor apagado)
   → `initialize()` construye con el primario/fallback; se «enciende» el monitor (ahora
   `displayByIndex(0)` devuelve otro `DisplayInfo`) → `displaysChanged()` → `buildCount` sube y el
   último `screen` recibido por `buildPipeline` es el del monitor encendido. En rojo hoy: hoy no
   existe el método y el pipeline no se reconstruye.
2. **No reconstruye de más:** mismo display resuelto → `displaysChanged()` deja `buildCount` igual.
3. **Difiere durante la grabación:** con `state: 'recording'`, `displaysChanged()` no reconstruye;
   al parar la grabación el pipeline se reconstruye con el display nuevo.

Para observar el display en el test hace falta que `FakeObs.buildPipeline` guarde el `_screen`
recibido (hoy lo ignora) — cambio trivial en el doble de test.

## Decisiones y alternativas consideradas

- **Reconstruir el pipeline** en vez de actualizar en caliente el `monitor_id` del source: el rebuild
  es el único camino ya probado (lo usa cada cambio de ajustes) y además re-resuelve el lienzo base,
  que también depende del display. Actualizar el source en caliente ahorraría vaciar el búfer, pero
  duplica lógica de resolución y deja el lienzo desincronizado.
- **Comparar el display resuelto** en vez de reconstruir en cada evento: `display-metrics-changed`
  se dispara por cosas irrelevantes (escala, work area, mover ventanas entre monitores) y cada
  rebuild vacía el búfer de repetición — sería perder clips por nada.
- **Seguir con `screenMonitorIndex`** en vez de migrar a un id estable de dispositivo: el índice
  vuelve a apuntar bien en cuanto la topología se restablece, que es el caso del bug. Migrar la
  identidad del monitor es un cambio de ajustes persistidos con su propia migración → tarea aparte
  si el owner lo quiere.
- **Debounce en `index.ts`** (adaptador de Electron) y no dentro del manager: el manager se mantiene
  testeable sin timers y la ráfaga de eventos es un detalle de la plataforma.

## Riesgos

- **Se vacía el búfer de repetición** cuando la reasignación ocurre: si el usuario enciende el
  monitor justo después de una jugada, esos segundos se pierden. Es inevitable con rebuild y el
  escenario (encender un monitor) no es un momento de juego.
- **Eventos en ráfaga / geometría transitoria**: mitigado con el debounce; si Windows reporta una
  geometría intermedia, el evento siguiente vuelve a disparar y se corrige.
- **Monitor apagado que Windows no retira** (algunos DP/HDMI mantienen el EDID): entonces no hay
  evento y no cambia nada — el comportamiento es el de hoy, no empeora.
- Verificación real (encender/apagar el OLED) es manual; los tests cubren la lógica del manager.

---

**Estado:** ✅ aprobado el 2026-07-26
