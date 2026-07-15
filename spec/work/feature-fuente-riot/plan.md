# Plan — Fuente de juegos de Riot (Riot Client)

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Una fuente más, calcada del patrón de `xbox`/`epic`: lee ficheros del disco, parser puro y aislado, y
degrada a `[]` ante cualquier error. Dos piezas:

1. **Parser puro** `parseRiotProductSettings(yaml: string): { name; installDir } | null`. Extrae con
   regex por línea **anclado a inicio** (para no pillar claves anidadas):
   - `installDir` ← `/^product_install_full_path:\s*"?([^"]+?)"?\s*$/m`
   - `name` ← `/^shortcut_name:\s*"?([^"]+?)"?\s*$/m`, quitándole `.lnk` (case-insensitive).
   Sin `product_install_full_path` → `null`. Si falta `shortcut_name`, se cae al nombre de la carpeta
   del juego (basename del `product_install_root` relativo, p. ej. `2XKO`) para no quedarse sin nombre.
   No se añade dependencia de YAML: solo interesan dos claves de primer nivel (igual que `xbox` saca
   `DefaultDisplayName` de su XML con un regex).
2. **Factory** `createRiotSource(metadataDir?, existe = existsSync): GameSource`. Recorre los subdirs de
   `metadataDir`, lee el `*.product_settings.yaml` de cada uno (si lo hay), lo parsea, comprueba
   `existe(installDir)` y arma `{ name, installDir, source: 'riot' }`. `metadataDir` por defecto:
   `join(process.env.PROGRAMDATA ?? 'C:\\ProgramData', 'Riot Games', 'Metadata')`. Inyectable para tests.
   Se salta el subdir `Riot Client` (es el launcher; además no tiene `product_settings.yaml`).

El escaneo de ejecutables no se toca: ya mapea `Lion.exe`/`Lion-Win64-Shipping.exe` → `2XKO` y filtra
`OfflineLauncher`/`EpicWebHelper`.

## Archivos / módulos afectados

- `src/main/games/sources/riot.ts` (nuevo) — parser + factory + `export const riotSource`.
- `src/main/games/types.ts` — añadir `'riot'` a `GameSourceId`.
- `src/main/games/index.ts` — importar `riotSource` y meterlo en `DEFAULT_SOURCES`.
- `src/main/games/__tests__/sources.test.ts` — `describe('Riot', …)`: parser puro (fixtures de yaml) y
  la fuente montando un `Metadata` de mentira en disco (instalado, no-instalado, carpeta ausente,
  yaml corrupto, dir inexistente → `[]`).

## Decisiones y alternativas consideradas

- **`product_settings.yaml`** vs **`RiotClientInstalls.json`** — el primero: da el **nombre** bonito
  (`shortcut_name`), no solo la ruta. El JSON solo mapea ruta → RiotClientServices.exe, sin nombre.
- **Regex por línea** vs **dependencia de YAML** — regex, sin dep nueva: son dos claves de primer nivel
  y el resto del yaml no interesa. Mismo enfoque que `xbox`. El anclaje `^…$` evita confundirlas con
  las anidadas (`settings.create_shortcut`, `dependencies.*`).
- **Presencia de `product_settings.yaml` = instalado** — es la señal fiable observada: los productos no
  instalados dejan la carpeta de metadatos pero sin ese fichero. Aun así se comprueba `existsSync` de la
  carpeta de instalación, como el resto de fuentes (doble red).
- **`metadataDir` inyectable** — para montar fixtures en disco sin tocar `C:\ProgramData` (igual que
  `createSteamSource` recibe las bibliotecas).

## Riesgos

- **El formato del yaml podría variar entre títulos** (Valorant, LoR…): solo se han visto los de 2XKO.
  Mitigado: las dos claves están documentadas y son las que usa Riot Client para todos; ante cualquier
  sorpresa (clave ausente, formato raro) el parser devuelve `null`/`[]` y el resto del índice sigue. La
  verificación E2E de otros títulos queda pendiente de tenerlos instalados (misma nota que GOG/Ubisoft
  en su día — ahora saldados).
- **Rutas con barras normales** (`E:/Riot Games/2XKO/Live`): Node las maneja en Windows (`existsSync`,
  `readdir`, `join` normalizan), como ya pasó con la ruta de Ubisoft.

---

**Estado:** ⏳ pendiente de aprobación
