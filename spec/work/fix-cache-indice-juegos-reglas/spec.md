# Spec — La caché del índice de juegos ignora los cambios de reglas y el «Volver a escanear»

**Tipo:** Fix
**Rama:** `fix/cache-indice-juegos-reglas`
**Fecha:** 2026-10-09

## Problema / Objetivo

Auditoría bug-hunter C, C2-BUG-2 (Medium). El arreglo de la v0.9.5 que saca del índice los runtimes
compartidos (QtWebEngineProcess —el «REDlauncher» fantasma—, 7z/7za, createdump, crs-*) no llega a
quien ya tenía `games-index.json` y no ha cambiado de juegos: sigue con los falsos positivos. El botón
«Volver a escanear los juegos instalados» tampoco los quita.

**Causa raíz:** la huella de la caché (`huellaDe`) solo depende de nombres y carpetas de los juegos.
Cambiar las reglas de escaneo (`scan.ts`) no la cambia, así que `doRefresh` reutiliza el índice viejo;
y el rescan del usuario (`GamesRescan` → `refreshGameIndex` → `refresh`) pasa por la misma
comprobación. En la máquina del owner no se notó porque su lista de excluidos cambió y con ella la
huella.

## Alcance

**Dentro:**
- `SCAN_RULES_VERSION` en `scan.ts` (a subir cuando cambien las reglas) dentro de la huella: las cachés
  de versiones anteriores se re-indexan una vez al actualizar.
- `GameIndexService.refresh({ force })`: el rescan del usuario re-escanea aunque la huella coincida; si
  hay un refresco en curso, el forzado va detrás en vez de perderse.
- Tests de regresión.

**Fuera (explícito):**
- Detectar cambios en el contenido de las carpetas de juego sin que el usuario lo pida.

## Criterios de aceptación

- [ ] Una caché con la huella del formato anterior se re-indexa aunque los juegos no cambien, y el
      índice ya no trae los exes que filtran las reglas actuales.
- [ ] `refresh({ force: true })` re-escanea con la huella igual; un forzado durante un refresco en curso
      se aplica.
- [ ] Suite verde.

## Ampliación (tanda D, D1-BUG-1)

**Problema.** Revisión de la tanda D, D1-BUG-1 (confirmado por el árbitro). Esta rama hizo que el IPC
`games.rescan` forzara siempre el re-escaneo, pero lo usan dos botones: «Volver a escanear los juegos
instalados» (Grabación, debe forzar) y «Sincronizar» de «No son juegos», que solo necesita releer los
launchers para sincronizar la lista curada: forzar convertía cada clic en un escaneo completo del disco.
Peor: `setExcluded` pide un refresco normal (`refreshGameIndex()`), y si llegaba con un rescan forzado en
curso, una app recién excluida seguía en el índice —se detectaba como juego y en modo auto arrancaba
grabaciones— hasta el siguiente refresco o reinicio. Antes de esta rama esa ventana era casi nula
(acierto de caché); con el forzado dura un escaneo entero.

**Causa raíz.** `GameIndexService.refresh()` sin `force` devolvía el refresco en curso tal cual, pero ese
`doRefresh` ya había leído los launchers y `this.exclusions(...)` antes del cambio del usuario: lo pedido
después se resolvía con un resultado calculado antes. Y el `rescan` del IPC no distinguía quién lo pedía.

**Dentro:**
- `refresh()` agrupa lo pedido durante un refresco en curso en UN refresco en cola que arranca cuando el
  actual termina (bien o mal), forzado si cualquiera de las peticiones lo era.
- `rescan(options?: { force?: boolean })` de punta a punta; el main valida la carga del renderer (solo
  un `force: false` literal desactiva el forzado). «Sincronizar» pide `{ force: false }`; «Volver a
  escanear» no cambia (fuerza).

**Criterios de aceptación:**
- [x] Una exclusión guardada durante un rescan forzado queda aplicada al terminar (el índice ya no trae
      la app).
- [x] Varias peticiones durante un refresco en curso producen UN solo refresco más; un forzado entre
      ellas lo vuelve forzado; nunca corren dos `doRefresh` a la vez; un fallo del refresco en curso no
      rompe el de la cola.
- [x] «Sincronizar» manda `{ force: false }`; «Volver a escanear» sigue forzando.
- [x] Suite verde.
