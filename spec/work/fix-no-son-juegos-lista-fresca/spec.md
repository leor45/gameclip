# Spec — «No son juegos»: guardar la lista pisa la recién sincronizada

**Tipo:** Fix
**Rama:** `fix/no-son-juegos-lista-fresca`
**Fecha:** 2026-10-09

## Problema / Objetivo

Hallazgo preexistente de la tanda D (Bajo). En **Ajustes → Grabación → «No son juegos»**, al añadir,
alternar o quitar una entrada, la UI puede acabar mostrando una lista **vieja**: la que se calculó
antes de que el refresco del índice sincronizara la lista curada (añadir apps conocidas instaladas,
quitar las automáticas desinstaladas). Esa lista sincronizada sí se guarda y se manda por
`SettingsChanged`, pero la respuesta de `setExcluded` llega después y la pisa en pantalla. Hasta
reabrir Ajustes o pulsar «Sincronizar», la UI no refleja lo que de verdad hay guardado.

Segundo síntoma: si el refresco del índice rechaza, `setExcluded` rechaza aunque la lista **sí** se
guardó, y el `void guardar(...)` del renderer deja ese rechazo sin capturar (la UI se queda con la
lista optimista).

**Objetivo:** `setExcluded` responde con la lista que hay en el almacén **después** del refresco; un
refresco fallido no hace fallar la llamada; y el renderer, si el IPC rechaza igualmente, se
resincroniza con los ajustes en vez de dejar la lista optimista y un rechazo suelto.

## Causa raíz

`setExcluded` (en `src/main/index.ts`) hacía `const next = guardarExclusiones(lista); await
refreshGameIndex(); return next.excludedGames;`. `next` es una foto tomada **antes** del refresco, y
el refresco ejecuta el callback `exclusions` → `sincronizarExclusiones`, que puede reescribir la lista
en el almacén. Devolver `next` descarta ese cambio. Además el `await` sin `try/catch` convertía un fallo
del refresco (posterior al guardado) en un fallo de toda la llamada.

## Alcance

**Dentro:**
- `setExcludedAndRefresh` (`src/main/games/exclusions.ts`): guarda → refresca (un fallo se registra y
  no se propaga) → devuelve la lista leída del almacén tras el refresco. `index.ts` la cablea.
- `NoSonJuegos.tsx`: si `setExcluded` rechaza, recarga la lista con `capture.getSettings()`.
- Tests de regresión.

**Fuera (explícito):**
- La cola de refrescos de `GameIndexService` (tanda D, D1): solo se **verifica** que el refresco que
  espera `setExcluded` arranca después del guardado (ver `plan.md`); no se toca.
- Que el renderer ignore una respuesta de `setExcluded` obsoleta frente a una más nueva cuando el
  usuario hace clics muy seguidos (carrera entre dos `guardar` en vuelo): preexistente, otro trabajo.

## Criterios de aceptación

- [x] `setExcludedAndRefresh` devuelve la lista posterior al refresco aunque el refresco la reescriba.
- [x] Guarda antes de refrescar.
- [x] Un refresco que rechaza (o lanza en síncrono) no hace rechazar la llamada: devuelve lo guardado.
- [x] Si falla el guardado en sí, rechaza y no refresca.
- [x] Si `setExcluded` rechaza en el renderer, la lista se recarga de `getSettings` y no queda rechazo
      sin capturar.
- [x] Gates verdes (type-check · lint · tests).
