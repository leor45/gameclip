# Plan — Build portable (.exe) con la API embebida

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

**La API va embebida en el proceso main, no como proceso hijo.** La alternativa (lanzar el server
como hijo con `ELECTRON_RUN_AS_NODE`) no compra nada: ese hijo también corre el runtime de Electron,
así que sus módulos nativos necesitan la misma ABI de Electron que el main — el problema de `bcrypt`
y `better-sqlite3` seguiría igual, pero con un proceso más que supervisar, matar al salir y esperar a
que esté listo. Embebido, la API es `app.listen()` dentro del main y el ciclo de vida es el de la app.

Eso obliga a que el código de `server/` cargue en la ABI de Electron. Dos módulos nativos lo impiden
y se resuelven distinto:

- **`bcrypt` → `bcryptjs`.** Es JS puro y sale del empaquetado por completo. Los hashes son
  intercambiables (mismo formato `$2b`), así que los usuarios ya registrados siguen entrando; se
  cubre con un test que valida un hash generado por `bcrypt` usando `bcryptjs`.
- **`better-sqlite3`: se inyecta el driver.** `openDatabase()` pasa a recibir el constructor de
  `Database` en vez de importarlo. El main le pasa `better-sqlite3-electron` (el alias con el
  prebuild de ABI 121 que ya instala el postinstall, y que la biblioteca usa desde la Fase 4);
  `dev:server` y los tests le pasan el `better-sqlite3` de Node. Es la misma frontera que ya existe
  en `src/main/library/database.ts` — no se inventa nada.

**Persistencia.** `server/data/` deja de ser la ubicación por defecto: la ruta de la DB pasa a ser un
parámetro. En el main es `userData/auth.db`, junto a `library.db` y `capture-settings.json`. En dev,
`dev:server` conserva `server/data/` (no se toca lo que ya funciona).

**Empaquetado.** `electron-vite build` compila main/preload/renderer, y `server/` entra al bundle del
main como código importado (mismo `package.json`, mismo `tsconfig.node.json`). Los nativos y ffmpeg se
marcan externos y `electron-builder` los deja **fuera del asar** (`asarUnpack`), porque libobs lanza
`obs64.exe` y ffmpeg es un ejecutable: tienen que ser archivos de verdad en el disco. El detalle que
rompe todo si se olvida: con `asarUnpack`, `require.resolve()` sigue devolviendo la ruta
`…/app.asar/…`, así que las dos rutas que se pasan a un ejecutable —`SetWorkingDirectory(packageDir)`
en `obs.ts` y `ffmpegPath`— hay que reescribirlas a `app.asar.unpacked`. Se centraliza en un helper
único (`unpackedPath`) para no repetir el `replace` en cada sitio.

**Instancia única.** `app.requestSingleInstanceLock()`: la segunda ejecución enfoca la ventana de la
primera y se cierra. Es la respuesta correcta al `EADDRINUSE` del puerto fijo (y, de paso, a que dos
libobs peleen por el mismo encoder). Si aun así el puerto está tomado por algo ajeno, el arranque de
la API falla con un diálogo en español en vez de morir en silencio.

## Archivos / módulos afectados

- `server/auth/auth.service.ts` — `bcrypt` → `bcryptjs`.
- `server/db/database.ts` — `openDatabase(driver, dbPath)`: driver y ruta inyectados.
- `server/index.ts` — sigue siendo el entrypoint de `dev:server`; pasa el driver de Node y `server/data/`.
- `server/api.ts` *(nuevo)* — `startApi({ driver, dbPath, port })`: crea la app y escuchea; lo usan el
  main y `server/index.ts`. Devuelve el `Server` para poder cerrarlo.
- `src/main/index.ts` — arranca la API en `ready` (antes de crear la ventana), cierra en `will-quit`,
  single-instance lock, `unpackedPath` sobre `ffmpegPath`.
- `src/main/capture/obs.ts` — `unpackedPath` sobre `packageDir` antes de `SetWorkingDirectory`.
- `src/main/paths.ts` *(nuevo)* — helper `unpackedPath` (puro, testeable).
- `electron.vite.config.ts` — `@shared` ya está; añadir los externals nativos al build del main.
- `package.json` — `bcryptjs`, `electron-builder`, script `build:portable`, bloque `build` con el
  target `portable`, `asarUnpack` y `extraResources` (licencias).
- `LICENSE` *(nuevo)* — GPL-3.0.
- `.gitignore` — ya ignora `release/`; sin cambios.
- Tests: `server/__tests__/auth.*` (hash de bcrypt válido en bcryptjs), `src/main/__tests__/paths.test.ts`.

## Decisiones y alternativas consideradas

- **API en el main** — descartado el proceso hijo (`ELECTRON_RUN_AS_NODE`): misma ABI de Electron, así
  que no evita ningún problema de nativos, y suma supervisión, cierre y espera de arranque.
- **`bcryptjs`** — descartado recompilar `bcrypt` para la ABI de Electron (como se hace con
  better-sqlite3): funcionaría, pero deja un nativo más que puede romperse en cada bump de Electron y
  hay que desempaquetarlo del asar. El coste real de `bcryptjs` es CPU en el hash, y aquí se hashea una
  vez por login local.
- **Driver de SQLite inyectado** — descartado dejar que `electron-builder` recompile `better-sqlite3`
  contra Electron en el empaquetado: eso rompería `dev:server`, que necesita el binario de Node en el
  mismo `node_modules`. La inyección deja convivir los dos, que es justo para lo que existe el alias.
- **`portable`, no `dir` ni NSIS** — es lo que pediste: un `.exe` que se ejecuta y ya.
- **DB del server en `userData`** — descartado `PORTABLE_EXECUTABLE_DIR` (datos junto al `.exe`) por
  ahora: es otra decisión de producto (¿pendrive?) y va en su propio spec.
- **GPL-3.0** — no es una elección libre: la app enlaza `@streamlabs/obs-studio-node` (GPL-2.0, es
  libobs) y redistribuye el `ffmpeg.exe` de `ffmpeg-static` (GPL-3.0-or-later). Mismo encuadre que
  Streamlabs Desktop, que es GPLv3 sobre osn.

## Riesgos

- **osn dentro del paquete es el riesgo real.** Es el mayor peso (libobs + plugins + `obs64.exe`) y su
  arranque depende de rutas y de un directorio de trabajo correctos. Si `SetWorkingDirectory` apunta al
  asar, libobs no inicializa. Mitigación: `asarUnpack` + `unpackedPath`, y la verificación se hace
  **ejecutando el `.exe` fuera del repo**, que es el único escenario que prueba de verdad las rutas.
- **Tamaño del `.exe`:** con libobs dentro, esperá del orden de centenares de MB. Entra de sobra en el
  límite de 2 GB por archivo de los releases de GitHub, pero no va a ser una descarga chica.
- **Puerto fijo:** si otra cosa ocupa el puerto de la API, la app no levanta. Con el lock de instancia
  única queda cubierto el caso propio; el ajeno se reporta con un diálogo claro (no se implementa
  puerto dinámico: el renderer arma la URL desde `@shared/config` y hacerlo dinámico es otra tarea).
- **Auto-arranque con Windows** (Fase 6) usa `setLoginItemSettings` y solo aplica empaquetado: recién
  ahora se puede verificar de verdad. Si algo falla ahí, es un `fix/` aparte, no entra en esta tarea.

---

**Estado:** ✅ aprobado el 2026-07-11
