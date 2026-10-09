# Spec — Rechazo sin capturar en el intervalo del auto-cambio de juego

**Tipo:** Hotfix (Muy bajo)
**Rama:** `hotfix/auto-switcher-rechazo`
**Fecha:** 2026-10-09

## Qué se rompe

Hallazgo preexistente de la tanda D. El intervalo del auto-cambio de juego (`src/main/index.ts`, cada
5 s con ≥ 2 juegos en ejecución) hace `void getForegroundWindowTitle().then(...)` **sin `.catch`**. Si esa
promesa rechaza, o si algo lanza dentro del `then` (`autoSwitcher.update`, `c.getStatus()`), el rechazo
queda sin capturar en el proceso principal de Electron: ruido en la consola o, según la configuración
de Node, algo peor.

`getForegroundWindowTitle` (`src/main/library/foreground.ts`) promete ser *best-effort: cualquier fallo
devuelve null*, pero solo lo cumple para los fallos asíncronos (callback con error, evento `'error'`).

## Causa raíz

La llamada a `execFile` está dentro del executor de `new Promise` **sin `try/catch`**: si `execFile`
**lanza en síncrono** (fallo de spawn síncrono, p. ej. `EFTYPE` o argumentos inválidos), la promesa
rechaza en vez de resolver `null`. Y en el llamador, la cadena no tiene `.catch`.

## Arreglo

- `foreground.ts`: `try/catch` alrededor del `execFile` (y de su `child.on('error')`) dentro del
  executor → `resolve(null)`. Recupera el contrato «cualquier fallo devuelve null».
- `index.ts`: `.catch((err) => console.error('[auto-switch] …', err))` en la cadena del intervalo, para
  cubrir también un fallo dentro del `then`.

## Tests

- `src/main/__tests__/foreground.test.ts`: con `execFile` mockeado para lanzar en síncrono,
  `getForegroundWindowTitle()` resuelve `null` (**rojo antes del arreglo**: rechazaba con
  `spawn EFTYPE`). Más dos tests del camino normal para fijar que el contrato no cambia (devuelve el
  título; `null` si es la propia app, sin título o con error de PowerShell).
- El `.catch` de `index.ts` **no tiene test**: es cableado de `app.whenReady()`, que no se puede
  ejercitar sin arrancar Electron. Queda cubierto por la lectura del diff y por el test de
  `foreground.ts`, que elimina la causa de rechazo conocida.

## Criterios de aceptación

- [x] `getForegroundWindowTitle()` resuelve `null` si `execFile` lanza en síncrono.
- [x] El intervalo del auto-cambio registra con `console.error` un fallo en su cadena en vez de dejarlo
      sin capturar.
- [x] Gates verdes (type-check · lint · tests).
