# Plan — La caché del índice de juegos ignora los cambios de reglas y el «Volver a escanear»

> **Este plan es un contrato.** Aprobado con el resto de la tanda C («sí, adelante»).

## Enfoque

1. `src/main/games/scan.ts`: `export const SCAN_RULES_VERSION = 2` con la instrucción de subirla al
   tocar `MAX_SCAN_DEPTH`, `CARPETAS_IGNORADAS` o `EXES_IGNORADOS`.
2. `src/main/games/index.ts`: `huellaDe` antepone `reglas:<versión>`; `refresh({ force })` encadena el
   forzado detrás del refresco en curso; `doRefresh(force)` salta la caché si `force`.
3. `src/main/index.ts`: `refreshGameIndex(force = false)`; el `rescan` del IPC pasa `true`.

## Archivos / módulos afectados

- `src/main/games/scan.ts`, `src/main/games/index.ts` (+ `src/main/games/__tests__/index.test.ts`)
- `src/main/index.ts`
- `spec/constitution/roadmap.md`

## Decisiones y alternativas consideradas

- **Versión manual de las reglas** frente a un hash de las regex: el hash cambiaría con cualquier
  retoque cosmético y no es más seguro que una constante con su instrucción al lado.
- **Re-indexado una sola vez al actualizar:** cuesta el escaneo del primer arranque (el mismo que la
  primera instalación) y luego vuelve a la caché.

## Riesgos

- Ninguno relevante: el primer arranque tras actualizar re-escanea en segundo plano, como ya hace
  cuando cambia la lista de juegos.

## Ampliación (tanda D, D1-BUG-1)

### Enfoque

1. `src/main/games/index.ts`: `refresh()` ya no devuelve el refresco en curso. Si hay uno corriendo,
   programa UN refresco en cola (`siguiente`) encadenado a que el actual termine —con `.catch`: un fallo
   del actual es de sus llamadores—; lo que llegue mientras espera se suma a esa misma promesa y le hace
   OR al `force`, que se lee al arrancar la cola (no al crearla). Lo que llega con la cola ya corriendo
   programa otra. `lanzar(force)` arranca `doRefresh` y limpia `refreshing` por identidad de promesa.
2. `src/shared/games.ts`: `normalizeRescanForce(options: unknown)`: `false` solo con `{ force: false }`
   literal; cualquier otra cosa (sin opciones incluido) → `true`.
3. `src/shared/ipc.ts` (`GamesApi.rescan(options?)` y contrato), `src/preload/index.ts` (manda
   `options ?? {}`), `src/main/ipc.ts` (`games.rescan(normalizeRescanForce(options))`),
   `src/main/index.ts` (`rescan: (force) => refreshGameIndex(force)`).
4. `src/renderer/views/ajustes/NoSonJuegos.tsx`: «Sincronizar» llama a `rescan({ force: false })`.
   Grabación no cambia.

### Decisiones y alternativas consideradas

- **La cola se mira antes que `refreshing`:** entre el fin del refresco en curso y el arranque de la cola
  hay unas microtareas con `refreshing` ya a null; lanzar ahí uno directo haría correr dos `doRefresh` a
  la vez. Con la cola primero, esa petición se suma a la cola.
- **Una sola cola, no una por petición:** N peticiones durante un escaneo cuestan un refresco más, no N.
- **Forzado por defecto en el IPC:** «Volver a escanear» sigue mandando `rescan()` sin opciones; solo
  quien pide expresamente `force: false` se queda en el refresco normal. Una carga rara del renderer
  nunca degrada el rescan del usuario.
- **Descartado: que `setExcluded` pase `force`.** Funcionaría (el forzado iba detrás del refresco en
  curso), pero cada clic en la lista costaría un escaneo completo del disco, y el problema de fondo
  —resolver una petición con un resultado calculado antes de ella— seguiría en `refresh()` para los demás
  llamadores (el detector, «Sincronizar»).
- **Coste:** un refresco pedido durante otro ahora espera al actual y corre después. Si nadie lo pidió
  forzado y nada cambió es un acierto de caché (solo relee los launchers); si cambió la lista de
  excluidos, re-indexa, que es lo que hacía falta.

### Riesgos

- `setExcluded` durante un rescan forzado tarda más en responder (espera al escaneo y al refresco de la
  cola). La UI ya actualiza la lista antes de esperar la respuesta.

---

**Estado:** ✅ aprobado el 2026-10-09
