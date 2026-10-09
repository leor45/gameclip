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
