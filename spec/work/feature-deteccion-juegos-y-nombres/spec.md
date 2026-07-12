# Spec — Detección automática de juegos instalados y nombres reales

**Tipo:** Feature (incluye el arreglo de la detección automática, con test de regresión)
**Rama:** `feature/deteccion-juegos-y-nombres`
**Fecha:** 2026-07-12

## Problema / Objetivo

Hoy hay que añadir casi todos los juegos a mano, y los que se detectan se muestran con un nombre feo
(el ejecutable). Tres frentes, una sola causa de fondo: **la app no sabe qué juegos hay instalados**.

### Causa raíz de la detección automática

**No es el bug del "id completo"** de la sesión anterior (aquel era el `monitor_id` del game capture).
Los `customGames` guardados en los ajustes son basenames limpios (`MilesMorales.exe`,
`ACBlackFlag.exe`), así que el matching de `findRunningGamesMatch` funciona bien para ellos.

La detección automática falla porque **la única fuente de juegos es una lista curada y hardcodeada**:
`KNOWN_GAME_PROCESSES` en `src/shared/games.ts:5-68`, unos 40 procesos (Valorant, CS2, Fortnite…).
El match es igualdad exacta contra esa tabla. Cualquier juego que no esté en ella —Miles Morales,
AC Black Flag, Arc Raiders— **nunca se detecta**, y la única salida es darlo de alta a mano. No hay
ningún bug de comparación: **falta la capacidad** de saber qué hay instalado en el PC.

### Nombres

De ahí se derivan los otros dos puntos: un juego automático se llama como diga la lista curada, y uno
manual se llama forzosamente como su ejecutable. Arc Raiders arranca `pioneergame.exe`, así que aunque
se detectara se vería como "pioneergame". El dato bueno ya está en disco, verificado en esta máquina:
el `appmanifest` de Steam de `MilesMorales.exe` dice `Marvel's Spider-Man: Miles Morales`, y los
metadatos del propio `.exe` (`FileDescription`) dicen exactamente lo mismo.

### Nombres de carpeta y de fichero

Hoy la carpeta y el nombre del clip salen del **ejecutable** (`clipBaseName(gameExecutable)` →
`acblackflag/`), y el nombre visible se resuelve solo al leer, con `gameFromFolderName()`. Eso deja los
clips de Arc Raiders en `pioneergame/pioneergame 2026.07.12 - ….mp4`, que es justo lo que no queremos.
La carpeta y el fichero pasan a usar el **nombre resuelto** del juego, saneado para Windows.

Es seguro: **OBS no escribe nunca en esa ruta**. Graba a un temporal y es Node quien lo mueve
(`relocateSavedFile()`, `renameSync`), así que los caracteres especiales no llegan a libobs.

**Objetivo:** que los juegos instalados se detecten solos y se guarden/muestren con su nombre real, y
que un juego añadido a mano pueda llevar el nombre que el owner quiera. **La identidad interna sigue
siendo el `.exe`**: detección, targeting de ventana y pistas de audio no cambian.

## Alcance

**Dentro:**

- **Índice de juegos instalados**, construido leyendo lo que cada launcher deja en disco o en el
  registro. Cada launcher es una "fuente" con la misma interfaz, y todas degradan a vacío sin romper:
  - **Steam** — `libraryfolders.vdf` → todas las bibliotecas → `appmanifest_*.acf` (`name` + `installdir`).
  - **Epic** — `%ProgramData%\Epic\EpicGamesLauncher\Data\Manifests\*.item` (`DisplayName` + `InstallLocation`).
  - **Xbox / Game Pass** — `C:\XboxGames\*\Content\MicrosoftGame.config`.
  - **GOG Galaxy** — `HKLM\SOFTWARE\WOW6432Node\GOG.com\Games\*` (`gameName` + `path`).
  - **Ubisoft Connect · EA App · Battle.net** — una única fuente genérica sobre el registro de
    desinstalación de Windows (`DisplayName` + `InstallLocation`, filtrado por publisher/ruta).
- De cada juego se escanea su carpeta de instalación para mapear **cada `.exe` → nombre del juego**
  (así `pioneergame.exe` → "ARC Raiders" y `FortniteClient-Win64-Shipping.exe` → "Fortnite", que ni
  siquiera es el ejecutable que declara el manifiesto de Epic).
- Detección automática que consulta ese índice además de la lista curada (que se mantiene: cubre
  juegos de launchers no indexados, como los de Riot).
- **Nombre visible por juego**, con una prioridad única y compartida:
  `nombre manual del owner` → `índice de launchers` → `KNOWN_GAME_PROCESSES` → `FileDescription` del exe → basename.
- **Alta manual con nombre opcional**: al añadir un juego se puede escribir un nombre; si se deja
  vacío se comporta como hoy. El campo viene **pre-rellenado** con el nombre que la app deduzca, y el
  nombre de un juego ya añadido se puede editar sin borrarlo.
- El listado de ajustes muestra `Nombre del juego (MiJuego.exe)`, o solo el `.exe` si no se puso nombre.
- Migración de los ajustes (`customGames: string[]` → objetos `{ executable, name? }`), sin perder los
  dos juegos ya dados de alta.
- **Carpeta y nombre de fichero con el nombre bonito**: `clipBaseName()` pasa a recibir el nombre
  resuelto del juego en vez del ejecutable → `ARC Raiders/ARC Raiders 2026.07.12 - ….mp4`. El saneador
  se endurece para nombres de catálogo (no solo de `.exe`):
  - fuera los caracteres que Windows prohíbe (`< > : " / \ | ? *` y los de control) — el apóstrofo, los
    acentos y los espacios son legales y se conservan: `Marvel's Spider-Man: Miles Morales` →
    `Marvel's Spider-Man Miles Morales`;
  - fuera `™` y `®` (legales en NTFS, pero incómodos fuera de él);
  - ni punto ni espacio final (Windows los rechaza), sin espacios dobles;
  - nombres reservados (`CON`, `PRN`, `AUX`, `NUL`, `COM1‑9`, `LPT1‑9`) → se les añade sufijo;
  - longitud acotada (~64 caracteres) para no acercarse al límite de 260 de las rutas de Windows.
- **Re-etiquetado de los clips ya catalogados**: al arrancar (con el índice listo) se re-resuelve la
  columna `game` de cada clip a partir de su carpeta. Los clips viejos de `acblackflag/` pasan a
  aparecer bajo "Assassin's Creed Black Flag Resynced" **sin mover ficheros** — el mismo nombre bajo el
  que se guardarán los nuevos, así que en la Biblioteca salen como **un solo juego** aunque en disco
  vivan en dos carpetas.

**Fuera (explícito):**

- Mover o unificar físicamente las carpetas de clips ya grabados (`acblackflag/` → `Assassin's Creed…/`).
  No hace falta para verlos como un solo juego; si algún día se quiere, es su propio spec.
- Heurística para juegos que no vengan de ningún launcher (instalaciones sueltas): se siguen añadiendo
  a mano — para eso está el nombre manual.
- Cualquier cambio en la captura, el targeting de ventana o las pistas de audio.
- Carátula del juego, tiempo jugado, o cualquier metadato más allá del nombre.

## Criterios de aceptación

- [ ] Arrancar Miles Morales lo detecta **sin haberlo añadido a mano**, y la barra de captura muestra
      `Marvel's Spider-Man: Miles Morales`.
- [ ] Un juego cuyo ejecutable no se parece a su nombre (Arc Raiders → `pioneergame.exe`) se detecta y
      se muestra con el nombre del juego, no con el del ejecutable.
- [ ] Añadir un juego a mano permite escribir un nombre opcional; el campo llega pre-rellenado cuando
      la app puede deducirlo, y se puede editar después.
- [ ] El listado de juegos de Ajustes → Grabación muestra `Nombre (ejecutable.exe)` cuando hay nombre,
      y solo `ejecutable.exe` cuando no lo hay.
- [ ] Un juego manual **sin** nombre se comporta exactamente como hoy (sin regresión).
- [ ] Los ajustes ya guardados (`ACBlackFlag.exe`, `MilesMorales.exe`) sobreviven a la migración.
- [ ] Un clip nuevo de Arc Raiders se guarda en `ARC Raiders/ARC Raiders 2026.07.12 - ….mp4`, no en
      `pioneergame/`. Uno de Miles Morales, en `Marvel's Spider-Man Miles Morales/` (sin los `:`).
- [ ] Los clips ya grabados en `acblackflag/` aparecen en la Biblioteca bajo el nombre real del juego —
      **la misma entrada** que los nuevos— y siguen estando en la misma carpeta del disco.
- [ ] El sondeo de procesos sigue siendo igual de barato que hoy: el índice se construye fuera del
      bucle de 5 s (cero llamadas a PowerShell en el camino caliente).
- [ ] Test de regresión: un proceso de un juego instalado vía launcher, **ausente** de la lista curada
      y de `customGames`, se detecta (hoy no se detecta).
- [ ] Gates verdes: type-check · lint · tests.

## Nota sobre las fuentes no verificables

El owner pidió indexar **todos** los launchers. Comprobado en esta máquina: Ubisoft Connect, EA App,
GOG Galaxy, Battle.net y Xbox están instalados pero **sin un solo juego** (carpetas de juegos vacías o
inexistentes; la clave `GOG.com\Games` ni existe). Steam y Epic sí se han verificado contra datos
reales. Las demás fuentes se escriben contra el formato documentado y se prueban con **fixtures**, pero
**no se pueden verificar de extremo a extremo** hasta que haya un juego instalado en ellas. Quedan
aisladas: si una falla, devuelve vacío y el resto del índice sigue funcionando.
