# Plan — Biblioteca de clips (Fase 4)

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

El catálogo vive en el **proceso main** (los clips son datos locales de la app), en SQLite
con `better-sqlite3` detrás de un repositorio inyectable. Problema ABI: el binario instalado
de `better-sqlite3` es para Node (ABI 127, lo usa el server) y Electron 29 necesita ABI 121.
Solución: **alias npm** `better-sqlite3-electron` (→ `npm:better-sqlite3@^11.10.0`) cuyo
binario se reemplaza por el prebuild oficial de Electron v121 (verificado que existe en las
releases de GitHub) vía `prebuild-install` en un script `postinstall`. El server sigue usando
`better-sqlite3` normal — dos carpetas, dos binarios, cero conflicto.

Piezas:

1. **Dominio compartido** (`src/shared/library.ts`): tipos `Clip`, `ClipPatch`, `ClipsQuery`
   y validación pura (título no vacío, tags únicos y sin espacios sobrantes) — testeable sin
   Electron.
2. **Repositorio** (`src/main/library/clips-repository.ts`): CRUD, búsqueda (LIKE sobre
   título/juego/tags), filtros y reconciliación contra un listado de archivos. Recibe la
   instancia `Database` por constructor → en tests corre con el `better-sqlite3` de Node en
   `:memory:`; en runtime con el alias de Electron. Tags como columna JSON (escala local,
   sin joins).
3. **LibraryManager** (`src/main/library/manager.ts`): abre la DB (`userData/library.db`),
   registra clips nuevos (con juego best-effort vía consulta PowerShell de la ventana en
   primer plano, fallo silencioso → null), reconcilia la carpeta de salida al arrancar,
   guarda thumbnails (dataURL → JPEG en `userData/thumbnails/`), elimina archivo+registro,
   y emite `changed` para push al renderer.
4. **Protocolo de medios** `gameclip-media://` (registerFileProtocol + scheme privilegiado
   con `stream: true`): `clip/<id>` y `thumb/<id>` resuelven contra el repositorio — el
   renderer nunca ve rutas absolutas ni puede pedir archivos fuera del catálogo. Necesario
   porque en dev el renderer es `http://localhost:5173` y no puede cargar `file://`.
5. **IPC** (contrato en `src/shared/ipc.ts`, handlers en `src/main/ipc.ts`, preload):
   `library:list`, `library:games`, `library:update`, `library:delete`, `library:open-folder`,
   `library:set-media` (duración + thumbnail desde el renderer) y evento `library:changed`.
6. **UI** (`src/renderer/views/Biblioteca.tsx` + componentes): grilla de tarjetas con
   thumbnail/duración/fecha/juego, búsqueda con debounce ligero, chips de favoritos y juego,
   reproductor modal (`<video controls>` sobre `gameclip-media://clip/<id>`), renombrar
   inline, tags, favorito, eliminar con confirmación y abrir carpeta. Un hook
   `useThumbnailer` genera duración+thumbnail para clips que no la tengan (video → canvas →
   dataURL → IPC).

## Archivos / módulos afectados

- `package.json` — alias `better-sqlite3-electron`, script `postinstall` (prebuild electron).
- `scripts/rebuild-sqlite-electron.mjs` — descarga el prebuild ABI 121 en el alias.
- `src/shared/library.ts` (+ tests) — dominio.
- `src/shared/ipc.ts` — canales/contrato/`GameclipApi.library`.
- `src/main/library/{database,clips-repository,manager,foreground}.ts` (+ tests de repo).
- `src/main/library/better-sqlite3-electron.d.ts` — tipos del alias.
- `src/main/{index,ipc}.ts` — wiring: protocolo, ingesta desde CaptureManager, handlers.
- `src/preload/index.ts` — `window.gameclip.library`.
- `src/renderer/views/Biblioteca.tsx`, `src/renderer/components/{ClipCard,ClipPlayer}.tsx`,
  `src/renderer/lib/useThumbnailer.ts` (+ tests de la vista), `src/renderer/styles.css`.
- `src/renderer/__tests__/setup.ts` — mock de `library` en `crearGameclipMock`.

## Decisiones y alternativas consideradas

- **SQLite en main con alias ABI-Electron** — alternativas: (a) metadatos en el server vía
  HTTP: acopla la biblioteca a que el server esté corriendo y mete datos locales en la DB de
  auth; (b) JSON store: sin consultas ni escala, y el roadmap fija SQLite. El alias con
  prebuild oficial no compila nada en la máquina del usuario.
- **Tags como JSON en la fila** — alternativa: tablas `tags`/`clip_tags` normalizadas.
  Innecesario a escala local; el repositorio esconde la representación y permite migrar.
- **Thumbnails en renderer (video→canvas)** — alternativa: ffmpeg empaquetado. Se evita una
  dependencia nativa pesada; el renderer ya decodifica mp4 (H.264) nativamente.
- **`registerFileProtocol` (deprecado) en vez de `protocol.handle`** — en Electron 29
  `protocol.handle` tiene problemas conocidos con range requests para `<video>` (seek); el
  API antiguo los maneja bien y sigue presente en 29.
- **Juego = ventana en primer plano al guardar (PowerShell)** — alternativa: lista de
  procesos + heurística de juegos (eso es Fase 6). Best-effort y editable por el usuario.

## Riesgos

- **Prebuild/ABI:** si el postinstall falla sin red, el main no abre la DB → LibraryManager
  degrada a estado de error visible en la vista (la app no crashea); el server no se ve
  afectado.
- **Thumbnails en jsdom:** el hook no puede generar en tests (no hay decodificación) — se
  testea con mocks; la generación real se verifica manualmente.
- **Nombres de archivo con caracteres raros** en el protocolo de medios: se resuelve por id
  de catálogo, nunca por ruta cruda del renderer.

---

**Estado:** ✅ aprobado el 2026-07-11 (aprobación delegada por el owner para esta sesión)
