# Plan — Lista de «no son juegos» (sincronizada y manual)

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

### Dominio (puro, en `src/shared/games.ts`)

- `ExcludedGame = { name: string; source: 'auto' | 'manual'; enabled: boolean }`.
- `NON_GAME_APPS`: lista curada `{ name, steamAppIds?: string[], names: RegExp | string[] }`
  (Wallpaper Engine 431960, Lossless Scaling 993090, Steamworks Common Redistributables 228980,
  SteamVR 250820, Soundpad 629520, OBS Studio 1905180, …).
- `autoExclusions(installed: { name; steamAppId? }[]): string[]` — nombres de catálogo instalados que
  matchean la lista curada.
- `syncExcludedGames(actual: ExcludedGame[], auto: string[]): ExcludedGame[]` — conserva las manuales
  tal cual; conserva las `auto` que siguen detectándose (con su `enabled`); añade como `auto` activa
  cada candidato cuyo nombre (case-insensitive) **no** esté ya en la lista; quita las `auto` que ya no
  se detectan.
- `activeExcludedNames(list)` — set en minúsculas de los nombres activos.
- `normalizeExcludedGames(unknown)` en `normalizeCaptureSettings` (dedupe por nombre, tope 100).

### Índice (`src/main/games/index.ts` + fuentes)

- `InstalledGame` gana `steamAppId?: string` (lo rellena `steam.ts` con el `appid` del manifiesto).
- `GameIndexService` recibe la opción `exclusions?: (juegos: InstalledGame[]) => string[]`: tras listar
  los juegos se llama (el main sincroniza y persiste ahí), los nombres devueltos se filtran **antes**
  de indexar (así un exe compartido con una app excluida no se vuelve ambiguo) y entran en la
  **huella** (cambiar la lista invalida el caché).
- `installed()` expone los juegos de la última lectura (incluidos los excluidos), para la UI.

### Main (`src/main/index.ts`, `src/main/ipc.ts`)

- `exclusions` del servicio: `sync = syncExcludedGames(store.excludedGames, autoExclusions(juegos))`;
  si cambió, `settingsStore.save({ excludedGames })` + push `settings:changed` al renderer **sin**
  pasar por `CaptureManager.setSettings` (que reconstruiría el pipeline y vaciaría el búfer).
- IPC nuevos: `games:list-installed` → `{ name, source }[]` y `games:set-excluded` → guarda la lista
  normalizada (mismo camino sin rebuild) y dispara `refreshGameIndex()`.
- El botón «Sincronizar» reutiliza `games:rescan`.

### Renderer (`src/renderer/views/ajustes/Grabacion.tsx`)

Sección «No son juegos» con su propio estado (lee `excludedGames` de los ajustes y escucha
`settings:changed`); cada acción llama a `games.setExcluded` al momento.

## Archivos / módulos afectados

- `src/shared/games.ts`, `src/shared/capture.ts`, `src/shared/ipc.ts` — dominio, ajuste, contrato IPC.
- `src/main/games/types.ts`, `src/main/games/sources/steam.ts`, `src/main/games/index.ts` — appid, filtro, huella.
- `src/main/index.ts`, `src/main/ipc.ts`, `src/preload/index.ts` — sync, IPC, puente.
- `src/renderer/views/ajustes/Grabacion.tsx` (+ CSS) — UI.
- Tests: `src/shared/__tests__/games.test.ts`, `capture.test.ts`, `src/main/games/__tests__/index.test.ts`, `sources.test.ts`, `src/renderer/__tests__/grabacion.test.tsx`.

## Decisiones y alternativas consideradas

- **Identidad por nombre de catálogo** — es lo que ve el owner (barra de captura, índice). Por exe
  obligaría a listar 20 exes de Wallpaper Engine.
- **Desactivar en vez de borrar las automáticas** — si se borraran, la siguiente sincronización las
  volvería a añadir; la entrada desactivada es la «memoria» de que el owner dijo que no.
- **Guardar sin `CaptureManager.setSettings`** — hoy todo guardado de ajustes reconstruye el pipeline y
  vacía el búfer; para una lista que cambia en segundo plano (sync al arrancar) no es aceptable.
- **Descartada: heurística sobre el tipo de app de Steam** — los `.acf` no lo traen y consultar la API
  de Steam añade red y fallos; la lista curada cubre el caso real.

## Riesgos

- La lista curada se queda corta: se mitiga con la vía manual.
- Conflictos de merge con `fix/deteccion-falsos-positivos` (ambas tocan `games/index.ts`): se resuelven
  en la rama de integración.

---

**Estado:** ✅ aprobado el 2026-10-08 (auto-aprobado por indicación del owner, con los 9 planes de la auditoría listos)
