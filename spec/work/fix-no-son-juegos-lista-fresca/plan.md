# Plan — «No son juegos»: guardar la lista pisa la recién sincronizada

> **Este plan es un contrato.** Aprobado por el owner (diseño propuesto en el encargo de la rama).

## Enfoque

1. `src/main/games/exclusions.ts` (nuevo): `setExcludedAndRefresh(lista, { guardar, refrescar, leer })`.
   `guardar(lista)` → `await refrescar()` dentro de `try/catch` (el fallo va a `console.error` y no se
   propaga: lo guardado está guardado) → devuelve `leer().excludedGames`, o sea lo que hay en el almacén
   **tras** el refresco. Si `guardar` lanza, la función rechaza (es una `async`) y no refresca.
2. `src/main/index.ts`: `setExcluded` pasa a `setExcludedAndRefresh(lista, { guardar: guardarExclusiones,
   refrescar: () => refreshGameIndex(), leer: () => settingsStore.load() })`.
3. `src/renderer/views/ajustes/NoSonJuegos.tsx`: `guardar` envuelve la llamada IPC en `try/catch`; en el
   `catch` registra el error y recarga con `capture.getSettings()` (con su propio `try/catch` para no
   dejar un rechazo suelto si también falla).

## Archivos / módulos afectados

- `src/main/games/exclusions.ts` (+ `src/main/games/__tests__/exclusions.test.ts`)
- `src/main/index.ts`
- `src/renderer/views/ajustes/NoSonJuegos.tsx` (+ `src/renderer/__tests__/grabacion.test.tsx`)
- `spec/constitution/roadmap.md`

## Decisiones y alternativas consideradas

- **Función en `src/main/games/exclusions.ts`** y no en `index.ts` (el cableado de `whenReady` no se
  puede probar) ni en `src/shared/games.ts` (esa es lógica pura compartida con el renderer; esta usa
  `console.error` y es solo del main).
- **Leer del almacén tras el refresco** en vez de que el refresco devuelva la lista: el sincronizador
  escribe por `guardarExclusiones`, así que el almacén es la única fuente de verdad, y es lo mismo que
  ya recibió la UI por `SettingsChanged`.
- **No propagar el fallo del refresco:** la operación pedida (guardar la lista) ya se cumplió; el índice
  se reintenta en el siguiente refresco (arranque, detector, «Sincronizar»).

### Verificación pedida: la cola de refrescos de la tanda D (sin cambiarla)

`GameIndexService.refresh()` (`src/main/games/index.ts`): `setExcluded` guarda **síncronamente** y
solo después llama a `refresh()`. Los tres casos:

- *Sin refresco en curso ni cola:* `lanzar(force)` arranca `doRefresh`, que hace `await listarJuegos()`
  antes de llamar a `this.exclusions(...)`: la lectura de la lista ocurre después del guardado.
- *Con un refresco en curso:* no se devuelve ese (ya leyó la lista vieja), se programa un refresco en
  cola que arranca cuando el actual termina (`refreshing.catch().then(lanzar)`): empieza **después** del
  guardado y ve las exclusiones nuevas.
- *Con la cola ya programada pero sin arrancar:* se suma a esa promesa, que también arrancará después de
  este guardado. *Con la cola ya corriendo:* `siguiente` se pone a null antes de `lanzar`, así que la
  petición programa otra posterior.

Conclusión: la promesa que espera `setExcluded` corresponde siempre a un `doRefresh` que **empieza
después del guardado**. Sin desviación; no hay nada que cambiar en la cola. Una vez resuelta, `leer()`
devuelve la lista con la posible auto-sincronización de ese mismo refresco.

## Riesgos

- Si el refresco falla, antes `setExcluded` rechazaba y ahora resuelve con la lista guardada; el único
  consumidor (`NoSonJuegos`) no depende de ese rechazo. Cubierto por test.
- Si dos `guardar` del renderer se solapan, la última respuesta gana (preexistente, fuera de alcance).
- `console.error` en el renderer dentro del `catch`: el `setup` de los tests no falla por él; el test lo
  silencia.

## Desviaciones

Ninguna respecto al diseño aprobado (salvo que `guardar` de las dependencias devuelve `unknown`: ya no
se usa el valor devuelto).

---

**Estado:** ✅ aprobado el 2026-10-09
