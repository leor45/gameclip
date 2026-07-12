# Plan — Detección automática de juegos instalados y nombres reales

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Cuatro piezas, en este orden.

### 1. Índice de juegos instalados (lo que arregla la detección)

Un módulo nuevo en main que lee lo que los launchers dejan en el PC y produce un mapa
**`ejecutable en minúsculas → { nombre, fuente }`**:

```
milesmorales                   → { name: "Marvel's Spider-Man: Miles Morales", source: 'steam' }
pioneergame                    → { name: "ARC Raiders",                        source: 'steam' }
fortniteclient-win64-shipping  → { name: "Fortnite",                           source: 'epic'  }
```

Cada launcher es una **fuente** con la misma interfaz —`listInstalledGames(): InstalledGame[]` con
`{ name, installDir, source }`— y **todas degradan a `[]` ante cualquier error**, así que un launcher
raro nunca puede tumbar el índice ni la app:

- **Steam** — parsea `libraryfolders.vdf` (aquí hay 5 bibliotecas: C/D/E/F/G) y de cada una los
  `appmanifest_*.acf` → `name` + `installdir` → `steamapps\common\<installdir>`. Parser mínimo por
  regex sobre pares `"clave" "valor"`; no hace falta una librería de VDF. **Leer en UTF-8**: los `.acf`
  traen `™`/`®` y en ANSI salen como `â„¢`.
- **Epic** — `%ProgramData%\Epic\EpicGamesLauncher\Data\Manifests\*.item`, JSON directo:
  `DisplayName` + `InstallLocation`.
- **Xbox** — carpetas de `C:\XboxGames\*`, nombre desde `Content\MicrosoftGame.config`.
- **GOG** — `reg query HKLM\SOFTWARE\WOW6432Node\GOG.com\Games /s` → `gameName` + `path`.
- **Registro de desinstalación** (cubre **Ubisoft Connect, EA App y Battle.net** de una vez) —
  `reg query …\CurrentVersion\Uninstall /s` (+ `WOW6432Node`) → entradas con `DisplayName` +
  `InstallLocation`, filtradas por publisher/ruta de juego y excluyendo los propios launchers y los
  redistribuibles. Es el mecanismo genérico: los tres launchers registran ahí sus juegos, y ninguno de
  los tres expone un manifiesto limpio (Battle.net guarda un protobuf, `product.db`, demasiado frágil
  para parsear).

Con la carpeta de instalación de cada juego, un escaneo recursivo de `.exe` mapea **todos** sus
ejecutables al nombre del juego. Esto es lo que resuelve Arc Raiders (`pioneergame.exe`) y Fortnite
(cuyo proceso real, `FortniteClient-Win64-Shipping.exe`, no es el `LaunchExecutable` del manifiesto).
Para que sea barato y no meta ruido: tope de **4 niveles** de profundidad, se saltan carpetas de ruido
(`_CommonRedist`, `DirectX*`, `EasyAntiCheat`, `BattlEye`, `DotNet*`, `Redist*`, `vc_redist*`) y se
descartan ejecutables auxiliares por patrón (`*crashhandler*`, `*crashreport*`, `unins*`, `*setup*`,
`dxsetup`, `vcredist*`).

El resultado se **cachea en `userData/games-index.json`** con una huella (rutas + mtime de los
manifiestos). Al arrancar: si la huella coincide, se carga el caché al instante; si no, se reconstruye
**en background** sin bloquear la ventana. Más un botón "Volver a escanear" en Ajustes → Grabación.

**El bucle de sondeo no cambia de coste:** se sigue usando `tasklist` cada 5 s (solo nombres, sin
rutas) y se consulta el índice en memoria. Cero llamadas a PowerShell/registro en el camino caliente.

### 2. Resolutor de nombre único

Una función pura en `src/shared/games.ts` que resuelve el nombre de un ejecutable **en un solo sitio**:

```
nombre manual del owner → índice de launchers → KNOWN_GAME_PROCESSES → FileDescription → basename
```

El `FileDescription` del exe solo se consulta **al dar de alta un juego a mano** (una llamada puntual,
nunca en el poll) para pre-rellenar el campo de nombre. `KNOWN_GAME_PROCESSES` se queda tal cual: es el
fallback para launchers que no indexamos (Riot y compañía).

**La identidad interna sigue siendo el `.exe`**: `RunningGameMatch.executable` no cambia, y con él
tampoco `resolveGameWindow()` (`obs.ts:514`), `appTrackName()` (`obs.ts:274`) ni `clipBaseName()`. Solo
cambia el `name`, que es lo que se muestra.

### 3. Nombre manual opcional

`customGames: string[]` pasa a `customGames: CustomGame[]` con `{ executable: string; name?: string }`.
`normalizeCustomGames()` migra lo viejo: un `string` suelto se convierte en `{ executable }` sin nombre,
así que los dos juegos ya guardados sobreviven y se comportan igual que hoy.

En Ajustes → Grabación: junto al selector/campo de ejecutable, un campo **"Nombre (opcional)"**
pre-rellenado con lo que deduzca la app. El listado pinta `Nombre (MiJuego.exe)` si hay nombre, y solo
`MiJuego.exe` si no. El nombre de un juego ya añadido se puede editar en sitio.

### 4. Nombre bonito en la carpeta y el fichero + re-etiquetado de lo viejo

**Los clips nuevos** pasan a guardarse con el nombre resuelto: `clipBaseName()` recibe el nombre del juego
en vez del ejecutable, y `targetPathFor()` (`relocate.ts`) le pasa ese nombre. Arc Raiders deja de caer en
`pioneergame/`. Es seguro porque **OBS graba a un temporal y es Node quien mueve el fichero**
(`renameSync`): los caracteres especiales no llegan nunca a libobs.

`clipBaseName()` se endurece, porque hasta hoy solo comía nombres de `.exe` y ahora come nombres de
catálogo: se quitan los caracteres prohibidos por Windows (`< > : " / \ | ? *` y los de control) más `™`/`®`,
se colapsan los espacios dobles, se recorta el punto o espacio final (Windows los rechaza), se desvían los
nombres reservados (`CON`, `NUL`, `COM1`…) y se acota la longitud a ~64 caracteres para no acercarse al
límite de 260 de las rutas. El apóstrofo, los acentos y los espacios son legales y se conservan:
`Marvel's Spider-Man: Miles Morales` → `Marvel's Spider-Man Miles Morales`.

**Los clips viejos no se mueven, y aun así no parten la Biblioteca en dos.** Sus carpetas llevan el
ejecutable (`acblackflag/`), y `gameFromFolderName()` —que ahora consulta el índice— las resuelve al mismo
nombre bajo el que van los nuevos. En la Biblioteca salen como **un solo juego** aunque en disco vivan en
dos carpetas.

Lo único que hay que arreglar en la BD es la columna `game` de la tabla `clips`, que guarda el nombre
*resuelto en su día* ("acblackflag"). Al arrancar, con el índice ya listo, se re-resuelve `game` para cada
clip a partir de su carpeta y se actualizan en una transacción las filas que cambien. Es idempotente,
barato (una pasada) y **sin E/S de ficheros** — nada del EPERM de `fix/guardar-edit-eperm`. El mismo paso se
reejecuta al cambiar el nombre de un juego, así que renombrar re-etiqueta sus clips solo.

## Archivos / módulos afectados

**Nuevos**

- `src/main/games/sources/steam.ts` · `epic.ts` · `xbox.ts` · `gog.ts` · `uninstall-registry.ts` — las fuentes.
- `src/main/games/registry.ts` — helper `reg query` (execFile, sin dependencias nuevas).
- `src/main/games/scan.ts` — escaneo de `.exe` de una carpeta (profundidad, ruido, blacklist).
- `src/main/games/index.ts` — orquesta las fuentes + caché en `userData/games-index.json` + refresco.
- `src/main/games/exe-metadata.ts` — `FileDescription` de un exe (puntual, para el alta manual).
- Tests en `src/main/games/__tests__/` (con fixtures de `.acf`, `.item` y salida de `reg query`).

**Modificados**

- `src/shared/games.ts` — `resolveGameName()` nueva; `findRunningGamesMatch()` acepta el índice y los
  `CustomGame`; `isManualGame()` adaptado.
- `src/shared/capture.ts` — tipo `CustomGame`, `normalizeCustomGames()` con migración desde `string[]`.
- `src/shared/clip-naming.ts` — `clipBaseName()` recibe el **nombre resuelto** (no el exe) y estrena
  saneador endurecido; `gameFromFolderName()` consulta también el índice y los nombres manuales.
- `src/main/capture/relocate.ts` — `targetPathFor()` pasa el nombre del juego en vez del ejecutable.
- `src/main/capture/game-detector.ts` — recibe el índice además de los `customGames`.
- `src/main/index.ts` — construye el índice al arrancar, lo inyecta en el detector y dispara el re-etiquetado.
- `src/main/capture/manager.ts` — `gameExecutableForName()` mira también el índice.
- `src/main/library/manager.ts` — re-etiquetado de la columna `game` (paso nuevo, transaccional).
- `src/shared/ipc.ts` · `src/preload/index.ts` · `src/main/ipc.ts` — canales nuevos `games:suggestName`
  (exe → nombre sugerido) y `games:rescan`.
- `src/renderer/views/ajustes/Grabacion.tsx` — campo de nombre, listado `Nombre (exe)`, edición, botón
  de reescaneo.

## Decisiones y alternativas consideradas

- **Índice desde los launchers**, en vez de una heurística "¿este proceso es un juego?" (pantalla
  completa + uso de GPU + lista negra). La heurística da falsos positivos (el navegador a pantalla
  completa), falsos negativos, y sobre todo **no aporta el nombre**. Los manifiestos son un dato exacto
  que ya está en disco y resuelven los tres puntos de golpe.
- **Índice construido una vez y cacheado**, en vez de resolver la ruta del proceso en cada sondeo
  (`Get-CimInstance Win32_Process` → `ExecutablePath`): eso obligaría a lanzar PowerShell cada 5 s, y
  algunos juegos con anti-cheat no devuelven la ruta a un proceso no elevado.
- **Escanear todos los `.exe` de la carpeta**, en vez de fiarse del ejecutable que declara el manifiesto.
  Fortnite es la prueba: su `LaunchExecutable` es un bootstrapper y el proceso real es otro.
- **Una sola fuente de registro para Ubisoft + EA + Battle.net**, en vez de tres parsers a medida. Los
  tres registran `DisplayName` + `InstallLocation` en el registro de desinstalación; el `product.db` de
  Battle.net es protobuf y no merece la pena. Menos código y menos superficie que mantener.
- **Nombre bonito en la carpeta y el fichero**, no solo en la UI. Guardar `pioneergame/pioneergame ….mp4`
  y enseñar "ARC Raiders" sería una mentira piadosa: el usuario también navega sus clips por el Explorador.
- **Re-etiquetar en la BD, no mover los ficheros viejos.** Mover `acblackflag/` a la carpeta nueva añadiría
  riesgo (EPERM, colisiones, clips en uso) para **cero** ganancia visible: `gameFromFolderName()` ya resuelve
  la carpeta vieja al mismo nombre que la nueva, así que la Biblioteca los muestra unidos igualmente.
- **La lista curada se queda.** Es el fallback para juegos cuyo launcher no indexamos.

## Riesgos

- **Cuatro fuentes no verificables end-to-end.** Ubisoft, EA, GOG y Battle.net no tienen ni un juego
  instalado en esta máquina (ni Xbox). Su lógica se prueba con fixtures, pero hasta que no se instale un
  juego real no hay garantía de que el formato sea el esperado. Mitigación: cada fuente está aislada y
  degrada a `[]`; un fallo suyo no afecta a Steam/Epic ni a la app.
- **Coste del primer escaneo.** Va en background y se cachea, pero con 5 bibliotecas de Steam y juegos
  grandes el primer arranque tardará un par de segundos en tener el índice. Hasta entonces la detección
  se comporta como hoy (lista curada + manuales).
- **Ruido en el índice** — ⚠️ **se materializó, y era peor de lo previsto.** Al probar contra la máquina
  real, la app detectaba **Fortnite a todas horas**: `EpicWebHelper.exe` vive dentro de la carpeta de
  Fortnite, pero lo arranca el launcher de Epic y corre siempre. Dos arreglos: (a) la blacklist descarta
  helpers, launchers y bootstrappers (el proceso real de Fortnite es `FortniteClient-Win64-Shipping.exe`,
  no su launcher); (b) un ejecutable que aparece en **dos juegos distintos** se descarta por ambiguo en
  vez de asignarlo al primero — quedarse con uno era peor que no tenerlo. Con las dos, el ruido bajó de
  79 ejecutables a 66 y no queda ningún falso positivo. Cubierto con test de regresión.
- **Colisión de basenames** entre dos juegos (dos juegos con `game.exe`): se descarta el ejecutable y se
  registra en el log. El owner siempre puede fijar el nombre a mano.
- **Dos carpetas por juego en disco** mientras convivan clips viejos (`acblackflag/`) y nuevos
  (`Assassin's Creed Black Flag Resynced/`). En la Biblioteca se ven como uno solo; en el Explorador, no.
  Unificarlas es una tarea aparte (mover ficheros).
- **Rutas largas.** Nombre de juego largo + marca de tiempo + `Capturas/` podría acercarse al límite de 260
  de Windows si la carpeta de salida ya es profunda. Se acota la base a ~64 caracteres.
- **Formatos de terceros no documentados.** Si Valve o Epic cambian el formato, la fuente degrada a vacío
  y la app sigue funcionando como hoy.

---

**Estado:** ✅ aprobado el 2026-07-12
