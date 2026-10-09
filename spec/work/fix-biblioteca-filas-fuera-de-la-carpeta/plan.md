# Plan — Filas de la biblioteca que cuelgan de fuera de la carpeta de clips

> **Este plan es un contrato.** Diseño aprobado por el owner al encargar el fix (hallazgos 1 y 6 de
> «Hallazgos preexistentes de la tanda D»). Las desviaciones están anotadas al final.

## Enfoque

1. `src/main/library/clip-path.ts`: `isInsideDir(dir, filePath)`. Pura manipulación de strings con
   `path.relative` (win32 compara sin distinguir mayúsculas y trata `/` y `\` igual): dentro ⇔ la ruta
   relativa no está vacía, no es `..` ni empieza por `..\` y no es absoluta (otra unidad u otro recurso).
   Quita antes el prefijo `\\?\` / `\\.\` (y `\\?\UNC\` → `\\`), que `path` no sabe comparar con la forma
   normal. Una carpeta vacía no contiene nada. **No usa `canonicalClipPath`**, que recorta la barra
   final y deja `D:\` en `D:` (= el directorio de trabajo de esa unidad).
2. `src/main/library/storage-manager.ts`: función `clipsDeLaCarpeta(outputDir)` = «cuelga de la carpeta
   y no vive en su unidad sin montar», en ese orden (lo de fuera se descarta por la ruta, sin tocar el
   disco; la comprobación de la unidad, una sola consulta, solo para lo de dentro). La usan `getStats`
   (siempre) y `enforceLimit` (con `opts.outputDir`; sin él cuenta todo, como hoy). TSDoc de ambos con
   el porqué.
3. `src/main/library/clips-repository.ts`:
   - `fusionarFilas(principal, descartados, orphanThumbnails)`: la lógica de suma de datos que estaba
     dentro de `dedupeByCanonicalPath`, extraída tal cual (campos vacíos, favorito, origen concreto
     sobre `scan`, etiquetas unidas, miniatura sobrante anotada). `guardarFusion` + `SQL_GUARDAR_FUSION`
     comparten el `UPDATE`. La migración las usa sin cambiar su comportamiento (sus tests no se tocan).
   - `mergeRows(ids, filePath)`: en una transacción, conserva la fila de menor id, borra las demás
     **antes** de escribir la ruta (índice UNIQUE), la deja en `filePath` y devuelve la fila. Si algo
     falla, no cambia nada y no anota miniaturas huérfanas (se anotan tras confirmar).
4. `src/main/library/manager.ts` (`reconcile`):
   - En el bucle de bajas, las filas que **sobreviven** porque su archivo existe y no cuelgan de la
     carpeta de clips se apuntan como «filas de fuera». Las conservadas por la unidad sin montar no
     (no se puede preguntar al disco por ellas).
   - **Prefiltro por nombre de archivo** (sin tocar el disco): solo se pide la identidad de las filas de
     fuera cuyo nombre (sin distinguir mayúsculas) coincide con el de algún archivo de `mediaFilesIn`.
     Identidad = `statSync(p, { bigint: true })` → `dev:ino:tamaño`; `null` si el `stat` falla, `ino`
     es 0 o el archivo está vacío. Se guarda en un mapa identidad → ids y el conjunto de nombres de las
     filas con identidad. Si no hay candidatas, no se hace ninguna consulta más.
   - Por cada archivo de `mediaFilesIn(outputDir)` cuyo nombre está en ese conjunto, mientras el mapa no
     esté vacío, su identidad: si
     coincide, `unificar`: sin fila propia → `setPath` de la de fuera (re-apuntar); con fila propia, o
     varias de fuera → `mergeRows` y se borran las miniaturas huérfanas. La entrada del mapa se borra
     al usarla (cada fila de fuera se consume una vez). Un fallo se registra y no corta el escaneo.
   - Contadores: re-apuntar no es alta ni baja; cada fila descartada en una fusión cuenta como baja;
     en ambos casos se emite `'changed'`.
   - `removeOrphanThumbnails()` extrae el bucle del constructor para compartirlo.
5. `relabelGames` no se toca: el `game` de una fila re-apuntada lo recalcula `relabelGames`, que corre
   justo después en el guardado de Ajustes (`syncLibraryAfterSettings`) y en el arranque tras refrescar
   el índice de juegos (`refreshGameIndex`, `index.ts`). Comprobado en el código.

## Archivos / módulos afectados

- `src/main/library/clip-path.ts`
- `src/main/library/storage-manager.ts`
- `src/main/library/clips-repository.ts`
- `src/main/library/manager.ts`
- `src/main/__tests__/clip-path.test.ts` (nuevo)
- `src/main/__tests__/storage-manager.test.ts`
- `src/main/__tests__/library-reconcile.test.ts` (junctions y hard links reales)
- `src/main/__tests__/clips-repository.test.ts`
- `spec/constitution/roadmap.md`

## Decisiones y alternativas consideradas

- **Vías de alta, comprobadas:** todas guardan dentro de `outputDir()`: `registerSavedClip` desde
  `clip-saved` (`finishSavedClip` → `targetPathFor({ outputDir: this.outputDir() })`; si la
  reubicación falla, el archivo se queda donde lo escribió libobs, la raíz de la misma carpeta),
  `screenshot-action.ts` (`capture.outputDir()`), `frame-capture.ts` (`outputDir` del IPC =
  `capture.outputDir()`) y el escaneo (`mediaFilesIn(outputDir)`). La excepción teórica es un clip
  guardado justo al cambiar la carpeta cuya reubicación entre unidades falla: queda en la carpeta
  anterior y no cuenta para el límite hasta que se mueva.
- **Identidad física frente a nombre + tamaño:** las copias del Explorador tienen el mismo nombre,
  tamaño y fecha; fusionarlas por eso destruiría el segundo archivo lógico. Volumen + índice de archivo
  distingue «el mismo archivo» de «una copia».
- **Prefiltro por nombre de archivo (pedido en la auditoría):** la primera versión pedía el `stat` de
  TODAS las filas de fuera y de TODOS los archivos de dentro en cada `reconcile` mientras hubiera filas
  de fuera —el caso más común: carpeta cambiada sin copiar y la vieja sigue existiendo—, para siempre y
  en el hilo principal; en un NAS, miles de idas y vueltas SMB nuevas. Las tres formas del bug (`Z:\` /
  UNC, junction, volumen montado en carpeta) conservan el nombre del archivo, así que el nombre decide,
  sin tocar el disco, quién puede tener pareja. Con una carpeta vieja de clips distintos: cero `stat`
  extra. En el escenario del Bug 1 (copias con el mismo nombre) sigue habiendo `stat`, y está bien.
  **Queda fuera, documentado:** un hard link con otro nombre. Se descartó antes un prefiltro por
  `size_bytes` de la DB: puede estar desfasado tras un edit de audio.
- **Rescate de filas muertas (revisión independiente, Media):** con el re-apuntado, la fila de un
  camino que luego desaparece (junction borrado, `Z:` sin reconectar) moría en el primer bucle de
  `reconcile` y el archivo volvía a entrar vacío. Las bajas pasan al FINAL del escaneo: el primer bucle
  recoge las «muertas» (misma regla de siempre, sin tocar la de la unidad sin montar); durante el
  escaneo, un archivo de dentro sin fila, que no se unificó por identidad, rescata (`setPath`) la
  muerta si hay **exactamente una** con su nombre (sin mayúsculas), es el **único** archivo sin fila con
  ese nombre y el tamaño de la fila coincide con el que ya mide el `stat` del alta (ninguna consulta
  nueva). Ambigüedad → nada de ese nombre se rescata. Lo no rescatado se da de baja al final (con su
  miniatura) y cuenta en `removed`. Un archivo que aparece entre la comprobación de la fila y el escaneo
  (`existente` es una muerta) la saca de las muertas. Cubre también la carpeta renombrada. Se cuenta por
  nombre solo (no nombre + tamaño) los archivos sin fila: más conservador de lo pedido.
  Por eso el escaneo calcula `getByPath` de todos los archivos antes del bucle (los mismos que antes,
  adelantados) para contar los sin fila.
- **Sin ver ningún archivo, no se borra lo de dentro (segunda pasada, Media):** el rescate no ayuda si el
  escaneo no ve nada: un junction borrado con la app cerrada (el arranque escanea antes de que la
  captura cree la carpeta; luego existe pero vacía por el `mkdirSync` del pipeline), una carpeta
  renombrada o movida, un volumen montado en carpeta desmontado. Al final de `reconcile`, si
  `mediaFilesIn` devolvió vacío, las muertas que cuelgan de `outputDir` (`isInsideDir`) se conservan
  esa pasada; las de fuera se borran como hoy; con al menos un archivo visto, rescate y bajas como
  antes. Misma filosofía que D5-BUG-3. **Coste aceptado:** vaciar a mano toda la carpeta deja las
  tarjetas hasta el siguiente archivo y escaneo, o hasta borrarlas desde la app. Las fantasma cuentan
  su tamaño en el límite y borrarlas solo quita la fila (leído `deleteClip`/`removeClipFile`:
  `rmSync({ force: true })` no lanza con un archivo inexistente; `trashItem` que falla cae al
  borrado; test en `storage-manager.test.ts`).
- **Unificar lo que depende del archivo (revisión, Baja):** `mergeRows(ids, filePath, mismoArchivo?)` y
  `setPath(id, path, sizeBytes?)` reciben el tamaño real y, al fusionar, el título personalizado (el que
  no es el derivado del nombre del archivo; si los dos, el de la conservada) y las pistas muteadas no
  vacías (si las dos, las de la conservada). Solo el camino `unificar`; sin el parámetro, y en la
  migración de rutas, la semántica es la de siempre.
- **Identidad con fecha de creación (revisión, Baja):** ReFS/Dev Drive no garantizan un índice de 64
  bits único y hay sistemas virtuales con índice constante o `FILE_INVALID_FILE_ID`. La huella suma
  `birthtimeNs` y se descarta `0xFFFFFFFFFFFFFFFF`. Medido en esta máquina: por junction, hard link y
  `\\localhost\C$\…` coinciden `dev`, `ino` y `birthtimeNs`; en una copia (`copyFileSync`) difieren
  `ino` y `birthtimeNs` (el mtime se conserva).
- **Todas las filas de fuera con la misma identidad se fusionan a la vez** (no una por archivo): con
  tres caminos al mismo archivo (v0.9.7 + otro cambio) una sola pasada deja una fila.
- **Hard link = el mismo archivo.** Mismo volumen e índice: es literalmente el mismo contenido; se
  trata como el mismo clip. Aceptado.
- **Archivo vacío y `ino` 0 sin identidad:** FAT/exFAT no da índice distinguible a un archivo vacío y
  algunos SMB no dan índice; mejor tratarlos como distintos (como hoy) que fusionar por error.
- **Orden `dentro` → `unidad` en `clipsDeLaCarpeta`:** las filas de otras carpetas no provocan la
  consulta a la raíz de la unidad de salida.

## Riesgos

- **Cambio de comportamiento deliberado:** quien cambia la carpeta de clips **sin mover** los clips
  viejos deja de verlos en el uso del almacenamiento y de que el auto-borrado los toque (antes
  contaban). Siguen en la biblioteca mientras existan sus archivos.
- **Coste:** un `stat` bigint por cada fila de fuera cuyo nombre coincide con un archivo de dentro y por
  cada archivo de dentro cuyo nombre coincide con una de ellas. Con una carpeta anterior de clips
  distintos, cero; sin filas de fuera, cero; con la unidad de la salida sin montar o una carpeta vacía,
  cero. Los clips de GameClip llevan fecha y hora en el nombre: las coincidencias reales son las copias.
- **Coste en el escenario del Bug 1:** con la carpeta vieja existente y los mismos nombres en la nueva
  (copia del Explorador), cada `reconcile` repite los `stat` de esas filas de fuera y de sus archivos
  gemelos mientras la vieja exista. Es el precio de poder distinguir copia de mismo archivo; no pasa
  con una carpeta vieja de clips distintos.
- **Guardar Ajustes grabando** con un cambio de forma de la carpeta no escanea (D5-BUG-2) pero aplica el
  límite: las filas de la forma vieja están «fuera» y no cuentan hasta el siguiente guardado sin grabar
  o arranque. Transitorio; nunca borra de más.
- **Rescate por nombre + tamaño:** dos archivos distintos de igual nombre y tamaño sin ambigüedad en la
  carpeta (uno muerto, uno nuevo) se tomarían por el mismo; los clips de GameClip llevan fecha y hora en
  el nombre, y el efecto es heredar los metadatos de la fila muerta, que se iba a borrar.
- **Falso positivo de identidad:** exigiría mismo volumen, mismo índice de archivo y mismo tamaño en
  archivos distintos; un servidor con índices no únicos es el único camino. Tendría como efecto
  re-apuntar una fila al archivo equivocado, sin borrar nada del disco.
- **`muted_tracks` y título de la fila descartada** no se suman (misma semántica que la migración): si el
  edit de audio se hizo sobre la tarjeta que se descarta, la conservada no lo refleja.

## Desviaciones del diseño aprobado

- `mergeRows` acepta N ids (el diseño hablaba de pares) para el caso de varias filas de fuera con la
  misma identidad.
- Se añade la exclusión de archivos vacíos de la identidad (no estaba en el diseño).
- Se salta el cómputo de identidades cuando `mediaFilesIn` no devuelve nada (carpeta de clips sin
  montar o vacía).
- Rescate de filas muertas, unificación de tamaño/título/pistas y fecha de creación en la huella (ver
  «Decisiones»): hallazgos de la revisión independiente, no estaban en el diseño aprobado.
- Prefiltro por nombre de archivo (ver «Decisiones»): no estaba en el diseño aprobado; lo pidió la
  auditoría por el coste en NAS. Deja fuera el hard link con otro nombre.
