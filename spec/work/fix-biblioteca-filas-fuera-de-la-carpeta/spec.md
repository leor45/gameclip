# Spec — Filas de la biblioteca que cuelgan de fuera de la carpeta de clips

**Tipo:** Fix
**Rama:** `fix/biblioteca-filas-fuera-de-la-carpeta`
**Fecha:** 2026-10-09

## Problema / Objetivo

Dos hallazgos preexistentes de la tanda D (roadmap, «Hallazgos preexistentes», 1 y 6) con la misma
raíz: el catálogo conserva filas cuyo archivo existe pero **no cuelga de la carpeta de clips actual**
(`outputDir`), y ni el límite de almacenamiento ni el escaneo saben distinguirlas.

- **Bug 1 (Medio, pérdida de datos) — el límite cuenta las copias de la carpeta anterior.** El owner
  copia `E:\Clips` (USB) a `D:\Clips` y cambia la carpeta en Ajustes con el USB todavía conectado. El
  guardado escanea `D:\Clips` y da de alta las copias (`scan`) mientras las filas del USB siguen vivas
  (sus archivos existen). `enforceLimit` corre justo después y cuenta las dos copias: con el
  auto-borrado activo borra clips reales, incluidos los originales del USB. Con el Explorador el mtime se
  conserva, así que originales y copias se intercalan de la más vieja a la más nueva y cae de todo.
  **Causa raíz:** `enforceLimit` y `getStats` suman `library.list()` entero; solo dejan fuera la unidad
  de la carpeta de clips sin montar (D5-BUG-3). Una fila viva de otra carpeta cuenta y es elegible.
- **Bug 6 (Bajo) — la misma carpeta por dos caminos se cataloga dos veces.** Una unidad de red vista
  como `Z:\Clips` y como `\\nas\recurso\Clips`, una carpeta de clips detrás de un junction o de un
  volumen montado en una carpeta. Si la carpeta de clips pasa de una forma a la otra, `reconcile`
  conserva las filas de la forma vieja (su archivo existe, por la otra ruta) y da de alta por la forma
  nueva los mismos archivos: la biblioteca se duplica mientras ambas formas existen. Quien ya lo sufrió
  en la v0.9.7 tiene las dos filas en su DB.
  **Causa raíz:** `reconcile` identifica un archivo solo por su ruta (texto); no tiene forma de saber
  que `Z:\Clips\a.mp4` y `\\nas\recurso\Clips\a.mp4` son el mismo archivo.

## Alcance

**Dentro:**
- `clip-path.ts`: helper `isInsideDir(dir, filePath)` (¿cuelga el archivo de la carpeta?), puro (sin
  consultar el disco), correcto con mayúsculas/minúsculas, `/` o `\`, barra final, raíz de unidad
  (`D:\`), UNC y prefijo `\\?\`.
- `StorageManager.enforceLimit` (con `outputDir`) y `StorageManager.getStats`: solo cuentan y solo son
  elegibles para borrar los clips de dentro de la carpeta de clips. Se mantiene la exclusión de la
  unidad sin montar. Sin `outputDir`, `enforceLimit` se comporta como hoy.
- `LibraryManager.reconcile`: las filas vivas que no cuelgan de la carpeta de clips («filas de fuera»)
  se comparan con los archivos de dentro por **identidad física** (volumen + índice de archivo +
  tamaño): un archivo de dentro sin fila que es el de una fila de fuera **re-apunta** esa fila (conserva
  todo); si ya tenía fila (duplicado de la v0.9.7) se **fusionan** en la de menor id.
- **Rescate de filas muertas** (hallazgo de la revisión independiente, introducido por el re-apuntado):
  deshacer un re-apuntado (volver a la ruta real tras borrar el junction; volver a `\\nas\…` tras un
  `Z:` que no se reconecta) dejaba la fila con la ruta de un camino que ya no existe, y `reconcile` la
  daba de baja —con título, favorito y etiquetas— y daba de alta el archivo vacío. Ahora las bajas se
  aplican al final del escaneo y una fila muerta cuyo archivo aparece de dentro con el mismo nombre y
  tamaño (sin ambigüedad) se re-apunta en vez de borrarse. Cubre también el preexistente «carpeta de
  clips movida o renombrada: las filas mueren y vuelven a entrar sin metadatos», y la copia hecha con
  el USB ya quitado.
- Al fusionar o re-apuntar por identidad, lo que depende del archivo se unifica: tamaño real, título
  personalizado y pistas muteadas no vacías (solo en `mergeRows`/`unificar`; la migración de rutas
  queda igual).
- La identidad física incluye la fecha de creación y descarta el índice `0xFFFFFFFFFFFFFFFF`
  (ReFS/Dev Drive y sistemas de archivos virtuales no garantizan un índice único).
- `ClipsRepository.mergeRows(ids, filePath)` y extracción de la lógica de fusión de la migración
  (`dedupeByCanonicalPath`) a una función común, sin cambiar su comportamiento.
- Tests de regresión (rojo → verde) y de no regresión.

**Fuera (explícito):**
- Detectar copias por nombre + tamaño (las copias del Bug 1 siguen siendo dos filas: son dos archivos).
  Lo que arregla el Bug 1 es que las de fuera no se midan ni se borren, no que se fusionen.
- Borrar o dar de baja las filas de la carpeta anterior mientras sus archivos existan: siguen en la
  biblioteca (se pueden ver y borrar a mano), solo dejan de contar para el límite.
- Reconocer la misma carpeta por dos caminos cuando el servidor no da identificador de archivo (`ino` 0)
  o el archivo está vacío: se tratan como archivos distintos, como hoy.
- **Limitación conocida (transitoria):** guardar Ajustes GRABANDO con un cambio de forma de la carpeta
  (`Z:` → UNC) no escanea (D5-BUG-2) pero sí aplica el límite: las filas de la forma vieja quedan
  «fuera» y no cuentan para el límite ni para el uso hasta el siguiente guardado sin grabar o el
  siguiente arranque. Nunca borra de más.
- Cualquier otro hallazgo de la tanda D (se anotan como preexistentes en el informe).

## Criterios de aceptación

- [ ] El escenario exacto del Bug 1 (originales en la carpeta vieja, copias en la nueva, límite por
      encima de una copia y por debajo de la suma, auto-borrado activo): no se borra nada y los
      originales siguen en disco.
- [ ] Con el límite realmente superado dentro de la carpeta de clips, se siguen borrando los más viejos
      **de dentro**, sin tocar los de fuera.
- [ ] `getStats(outputDir)` mide lo mismo que el límite: los clips de fuera no cuentan.
- [ ] `isInsideDir` acierta con mayúsculas, `/`, barra final, raíz de unidad, UNC y `\\?\`, y no confunde
      `D:\Clips2` con `D:\Clips`.
- [ ] Combinado con la unidad de la carpeta de clips sin montar: no se borra nada y no se consulta el
      disco de otras unidades.
- [ ] Catalogado por la ruta real y `reconcile(<junction>)`: no duplica y conserva título, favorito,
      etiquetas, miniatura, duración y pistas muteadas (y el camino inverso).
- [ ] Un duplicado ya existente (las dos filas) se fusiona en una: la de menor id, con la ruta de dentro
      y los datos de ambas; la miniatura que sobra se borra; cuenta como una baja.
- [ ] Dos archivos distintos con el mismo nombre y tamaño no se fusionan (ni con el mismo índice si la
      fecha de creación difiere, ni con índice 0 o `0xFFFFFFFFFFFFFFFF`).
- [ ] Re-apuntar a un junction, borrarlo y volver a la ruta real conserva la fila y sus metadatos; igual
      con una carpeta de clips renombrada y con la variante `Z:`/UNC. Con ambigüedad (dos filas muertas o
      dos archivos con el mismo nombre) o tamaño distinto no se rescata nada; una fila muerta sin pareja
      se da de baja como siempre.
- [ ] Al fusionar el tamaño es el real, el título el personalizado y las pistas las no vacías.
- [ ] Sin filas de fuera no hay ninguna consulta de identidad al disco.
- [ ] Un fallo al unificar una fila no corta el escaneo.
- [ ] Los tests de la migración de rutas siguen verdes sin tocarlos.
- [ ] Type-check, lint y suite completa verdes.
