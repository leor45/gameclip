# Plan — Falsos positivos en la detección de juegos

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Tres cambios pequeños y locales, cada uno con su test de regresión escrito primero (rojo → verde),
usando los datos reales de la máquina del owner como fixture.

1. **`uninstall-registry.ts`** — además de `NO_ES_JUEGO` (nombres exactos), un patrón
   `ES_HERRAMIENTA = /launcher|updater|social club/i` que se evalúa contra el `DisplayName` **y** contra
   la última carpeta de `InstallLocation`. Lo que matchee se descarta antes de mirar la editora.
2. **`scan.ts`** — se añaden a `EXES_IGNORADOS`: `/^qtwebengineprocess$/i`, `/^7za?$/i`, `/^7z$/i`,
   `/^createdump$/i`, `/^crs-(handler|uploader)$/i`. Anclados (`^…$`) para no tocar exes de juegos
   que contengan esas letras.
3. **`index.ts`** — la clave de dedupe de `listarJuegos` pasa a ser la ruta canónica:
   `resolve(installDir.trim().replace(/[\\/]+$/, '')).toLowerCase()`.

El caché `games-index.json` se invalida solo: la lista de juegos cambia (sale REDlauncher, se quitan
duplicados) → cambia la huella → se reconstruye en el siguiente refresco.

## Archivos / módulos afectados

- `src/main/games/sources/uninstall-registry.ts` — patrón de herramientas.
- `src/main/games/scan.ts` — exes de runtime ignorados.
- `src/main/games/index.ts` — clave de dedupe canónica.
- `src/main/games/__tests__/sources.test.ts`, `src/main/games/__tests__/index.test.ts` — regresiones.

## Decisiones y alternativas consideradas

- **Patrón y no añadir `redlauncher` a la lista exacta** — la lista exacta es la que falló: cada
  launcher nuevo (Bethesda.net Launcher, Rockstar Social Club…) volvería a colarse.
- **Ignorar los exes genéricos aunque los traiga un juego real** — un `QtWebEngineProcess` nunca es el
  proceso que dibuja el juego; perderlo no quita detección y evita que cualquier app Qt dispare.
- **Descartada: validar la ruta del proceso en el sondeo** — es la defensa de fondo, pero obliga a
  cambiar `tasklist` por una consulta con rutas (más cara cada 5 s). Fuera de alcance, ver spec.

## Riesgos

- Un juego cuyo `DisplayName` contenga «Launcher» (raro) dejaría de detectarse por esta fuente; sigue
  pudiendo añadirse a mano. Se acepta.

---

**Estado:** ✅ aprobado el 2026-10-08 (auto-aprobado por indicación del owner, con los 9 planes de la auditoría listos)
