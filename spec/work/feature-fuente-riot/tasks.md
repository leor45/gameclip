# Tasks — Fuente de juegos de Riot (Riot Client)

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. `src/main/games/types.ts` — añadir `'riot'` a `GameSourceId`.
- [x] 2. `src/main/games/sources/riot.ts` — `parseRiotProductSettings(yaml)` (regex anclado) +
       `createRiotSource(metadataDir?, existe?)` + `export const riotSource`.
- [x] 3. `src/main/games/index.ts` — importar y meter `riotSource` en `DEFAULT_SOURCES`.

## Tests unitarios (obligatorios)

Camino feliz **y** casos borde, con fixtures.

- [x] Parser: extrae `product_install_full_path` + `shortcut_name` (sin `.lnk`) sin pillar claves anidadas.
- [x] Parser: sin `product_install_full_path` → `null`.
- [x] Parser: sin `shortcut_name` → nombre por la carpeta del juego (penúltimo segmento).
- [x] Fuente: producto instalado (yaml + carpeta) → lo devuelve con su nombre.
- [x] Fuente: carpeta de metadatos sin `product_settings.yaml` (no instalado) → no entra.
- [x] Fuente: carpeta de instalación ausente → se descarta.
- [x] Fuente: se salta el subdir `Riot Client`.
- [x] Fuente: `Metadata` inexistente → `[]` sin romper.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 750 pasan
- [x] Comprobación E2E real: la fuente `riot` devuelve `2XKO` y el índice mapea `lion` → `2XKO`.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
