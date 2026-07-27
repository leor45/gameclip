# Spec — Reasignar el monitor de escritorio al encender la pantalla

**Tipo:** Fix
**Rama:** `fix/monitor-reasignar-al-encender`
**Fecha:** 2026-07-26

## Problema / Objetivo

Con dos monitores y el principal (OLED) apagado durante el arranque de Windows, GameClip inicia
viendo un solo display. La grabación de escritorio queda apuntando al monitor secundario y **sigue
apuntando ahí aunque después se encienda el principal**, pese a que en Ajustes se ve seleccionado el
correcto. La única forma de corregirlo hoy es abrir Ajustes y pulsar «Guardar».

**Causa raíz:** el display objetivo se resuelve **una sola vez, al construir el pipeline**
(`CaptureManager.rebuildPipeline` → `env.displayByIndex(settings.screenMonitorIndex)`, con caída al
primario si el índice no existe: [manager.ts:646-649](../../../src/main/capture/manager.ts#L646-L649)),
y ese `DisplayInfo` se le pasa a libobs para elegir el `monitor_id` del `monitor_capture`
([obs.ts:731-742](../../../src/main/capture/obs.ts#L731-L742)). Nada en la app escucha los eventos de
`screen` de Electron (`display-added` / `display-removed` / `display-metrics-changed`), así que un
cambio de topología de monitores **no reconstruye el pipeline**: el fallback al display disponible se
queda congelado. Guardar ajustes funciona porque `setSettings` sí encola un rebuild.

Consecuencia secundaria de la misma causa: como los monitores se identifican por **índice** de
`screen.getAllDisplays()`, con el principal apagado el índice 0 pasa a ser el secundario — el índice
guardado apunta al monitor equivocado mientras dure el apagón, sin que el usuario cambiara nada.

## Alcance

**Dentro:**
- Escuchar los cambios de topología de displays en el proceso main y, cuando el display objetivo
  resuelto **cambie** respecto al que se usó para construir el pipeline vigente, reconstruirlo.
- Debounce de los eventos (encender un monitor dispara ráfagas y estados transitorios de Windows).
- Diferir el rebuild si hay una grabación en curso (reusar `pendingRebuild`), para no cortar un clip
  a la mitad.
- No reconstruir si el display resuelto es idéntico al vigente (el rebuild vacía el búfer de repetición).
- Test de regresión que reproduce el bug: pipeline construido con un solo display → aparece el
  display seleccionado → el pipeline se reconstruye con el display correcto.

**Ampliación aprobada por el owner (2026-07-26, tras verificar el fix en su máquina):** misma causa
raíz en el **overlay de avisos** (REC y «Clip guardado»). Su posición se calcula **una sola vez, al
crear la ventana** ([overlay.ts](../../../src/main/overlay.ts)); como las ventanas se reutilizan (solo
se ocultan, nunca se destruyen), los avisos se quedaban en el monitor que era primario al arrancar
mientras la grabación ya se había mudado al correcto. El overlay de **rendimiento** no lo sufre
porque recalcula su posición en cada `sync()`. Entra en esta rama a petición del owner, en vez de en
un hotfix aparte.

**Fuera (explícito):**
- Cambiar la identidad persistida del monitor (seguir con `screenMonitorIndex`; no se migra a un id
  estable de dispositivo).
- Refrescar la lista/miniaturas de monitores de la vista de Ajustes en caliente.
- Que los overlays sigan al **monitor configurado para grabar**: los dos siguen al primario de
  Windows, como hasta ahora. Cambiar ese criterio es una decisión de producto, no este bug.
- Cualquier cambio en la selección de ventana de juego o en el resto del pipeline.

## Criterios de aceptación

Observables y verificables uno a uno:

- [x] Con el monitor seleccionado apagado al arrancar, GameClip graba el escritorio del monitor
      disponible (fallback actual, sin regresión).
- [x] Al encender el monitor seleccionado, sin tocar Ajustes, la siguiente grabación/clip sale de ese
      monitor (el pipeline se reconstruyó solo).
- [x] Apagar el monitor seleccionado con la app corriendo vuelve a caer al display disponible en vez
      de grabar negro.
- [x] Un evento de displays que no cambia el display objetivo (p. ej. cambio de escala en otro
      monitor) **no** reconstruye el pipeline ni vacía el búfer.
- [x] Si hay una grabación en curso cuando cambia la topología, el clip termina completo y el rebuild
      se aplica al cerrarlo.
- [x] Test de regresión en rojo antes del arreglo y en verde después; suite, type-check y lint verdes.
- [ ] Ampliación: al encender el monitor seleccionado, el REC y el toast «Clip guardado» aparecen en
      el monitor primario de ese momento, no en el que lo era al arrancar la app.
- [ ] Ampliación: un REC **ya visible** cuando cambian los monitores se recoloca sin esperar a que se
      oculte.
