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
   - Si hay filas de fuera **y** archivos que escanear: identidad de cada una (`statSync(p, { bigint:
     true })` → `dev:ino:tamaño`; `null` si el `stat` falla, `ino` es 0 o el archivo está vacío) en un
     mapa identidad → ids. Si no, no se hace ninguna consulta más.
   - Por cada archivo de `mediaFilesIn(outputDir)`, mientras el mapa no esté vacío, su identidad: si
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
- **Sin precondición por tamaño de la fila (`size_bytes`):** se valoró no pedir el `stat` de los
  archivos con fila cuyo tamaño en la DB no coincide con ninguna fila de fuera. Se descartó: el tamaño
  de la DB puede estar desfasado (un edit de audio reescribe el archivo) y se perdería la fusión; el
  coste ya existe a esa escala (`existsSync` de cada fila, `getByPath` de cada archivo) y solo se paga
  mientras haya filas de fuera sin usar.
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
- **Coste:** con filas de fuera sin consumir (carpeta anterior legítima), cada `reconcile` hace un
  `stat` bigint por cada una y por cada archivo de dentro. Local: milisegundos por millar. Sin filas de
  fuera, cero. La unidad de la salida sin montar, o una carpeta vacía, no hacen ninguno.
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
