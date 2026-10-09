# Tasks — El escaneo de la biblioteca: carpetas ilegibles, grabación en curso y unidades sin montar

## Tests unitarios (obligatorios; primero, en rojo)

- [x] Regresión D5-BUG-1: subcarpeta sin permiso (EPERM simulado) → no lanza, lo legible se cataloga.
- [x] Regresión D5-BUG-1: la carpeta de clips entera ilegible → no lanza ni da de baja nada.
- [x] Regresión D5-BUG-1: archivo que desaparece entre el listado y el `stat` → se salta.
- [x] Regresión D5-BUG-1: `$Recycle.Bin`, `$RECYCLE.BIN` y `System Volume Information` (también dentro
      de un volumen montado en una carpeta) no se catalogan.
- [x] Regresión D5-BUG-3: con la unidad de la carpeta de clips sin montar, sus clips conservan fila,
      título, etiquetas, favorito, pistas muteadas y miniatura.
- [x] No regresión: en la misma pasada, el clip borrado de una unidad montada se da de baja con su
      miniatura.
- [x] Unidad de la carpeta de clips caída: una consulta a su raíz por pasada y ninguna por clip.
- [x] Regresión D5-BUG-2: grabando no se escanea; el re-etiquetado y el límite sí corren.
- [x] Regresión D5-BUG-2 (integración con el catálogo real): el MP4 en la raíz durante la grabación,
      tras reubicarlo y registrarlo, deja una sola fila `recording` con el tamaño final.
- [x] Regresión D5-BUG-1: un escaneo, re-etiquetado, límite u `outputDir()` que lanzan no salen del
      listener, y el resto de pasos corre.
- [x] No regresión: sin grabación (`idle`, `buffering`, `initializing`, `unavailable`) escanea,
      re-etiqueta y aplica el límite, en ese orden.

## Implementación

- [x] 1. Extraer el listener de `'settings'` a `settings-sync.ts` tal cual (refactor puro), para
      poder probarlo en rojo.
- [x] 2. `mediaFilesIn`: carpetas de sistema fuera y `readdirSync` en try/catch.
- [x] 3. `reconcile`: el `stat` de las altas en try/catch; una fila sin archivo se conserva si su
      unidad no está (afinado en B1-1: solo la unidad de la carpeta de clips).
- [x] 4. `syncLibraryAfterSettings`: sin escaneo grabando, pasos aislados, nunca lanza.
- [x] 5. `setupLibrary`: la migración y el escaneo inicial en try/catch.

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes (85 archivos, 1072 tests; 1081 tras B1-1)
- [x] Medido en Windows: raíces de `path.parse` (`D:\`, `\\servidor\recurso\`, `\\?\D:\`),
      `existsSync` de una letra sin unidad (false), `rmSync({ force: true })` sobre una unidad
      inexistente (no lanza), nombres reales de la papelera (`$Recycle.Bin` en C:, `$RECYCLE.BIN` en
      D:) y `EPERM` de `readdirSync('C:\System Volume Information')`. En UNC, `existsSync` de la raíz
      `\\localhost\C$\` da true (5 ms) y la de un recurso inexistente da false tras ~4 s la primera
      vez y ~0 ms las siguientes (Windows recuerda la respuesta negativa, también para los archivos
      de dentro).
- [ ] Comprobación manual en la app: carpeta de clips en la raíz de una unidad y un USB desenchufado
      al arrancar (en este fix no se ejecutó la app).

## Corrección tras revisión (B1-1)

Tests (primero, en rojo):

- [x] Regresión B1-1: carpeta del USB copiada a la carpeta nueva y USB quitado → las filas del USB se
      dan de baja, se catalogan las copias y no hay duplicados.
- [x] La unidad de la carpeta de clips se compara sin mayúsculas ni tipo de barra (`z:/Clips`).
- [x] Una ruta con prefijo `\\?\` se juzga por su archivo, como antes del fix.
- [x] `createVolumeAccessCheck`: false solo para una raíz ausente, una consulta por unidad (también
      con `/`), y `\\?\`, `\\.\` o sin raíz cuentan como accesibles.
- [x] Regresión B1-1: `getStats` no cuenta los clips de una unidad ausente.
- [x] Regresión B1-1: el límite no cuenta las copias muertas → con el uso real bajo el límite no
      borra nada (copias intercaladas con el mismo mtime).
- [x] Regresión B1-1: sobre el límite borra solo clips accesibles y mide el uso sin los ausentes; la
      fila ausente sobrevive.
- [x] No regresión: una ruta con prefijo `\\?\` sigue contando en `getStats`.
- [x] Los tests de D5-BUG-3 pasan a usar la carpeta de clips en la unidad ausente (el caso real).

Implementación:

- [x] 1. Helper movido a `clip-path.ts` tal cual (refactor puro) y exportado con `volumeRootKey`.
- [x] 2. `reconcile`: se conserva solo con la unidad de la carpeta de clips sin montar; el resto,
      baja si falta el archivo.
- [x] 3. `createVolumeAccessCheck`: clave normalizada (`/` → `\`); `\\?\`, `\\.\` y sin raíz cuentan
      como accesibles.
- [x] 4. `getStats` y `enforceLimit` ignoran los clips de una unidad no accesible (afinado en 1.2:
      solo la de la carpeta de clips).
- [x] 5. Gates: type-check, lint y suite completa verdes (85 archivos, 1081 tests).

## Segunda corrección tras revisión (1.1, 1.2)

Tests (primero, en rojo):

- [x] Regresión 1.1: carpeta de clips en la raíz de un recurso caído (servidor inventado, sin red)
      dada como `\\…\clips`, `//…/clips` y `\\…\clips\` → sus clips se conservan.
- [x] Regresión 1.1: `volumeRootKey` da la misma clave con o sin barra final, con `/` o `\` y con
      cualquier capitalización (`\\nas\clips\`, `d:\`).
- [x] Regresión 1.2: `getStats` con filas en tres unidades → solo consulta la raíz de la carpeta de
      clips, deja fuera las suyas y cuenta las de otra unidad ausente (como en `main`).
- [x] Regresión 1.2: `enforceLimit` deja fuera solo la unidad de la carpeta de clips sin montar,
      cuenta la otra unidad ausente y no la consulta.
- [x] 1.1 en el límite: carpeta en la raíz de un recurso caído sin barra final → sus clips no cuentan.
- [x] B1-1 de punta a punta: el escaneo da de baja las copias muertas y después el límite no borra
      nada.

Implementación:

- [x] 1. `volumeRootKey` y `createVolumeAccessCheck` con la raíz normalizada (acabada en `\`).
- [x] 2. `createOfflineOutputVolumeCheck(outputDir)` compartido por `reconcile`, `getStats` y
      `enforceLimit`: una sola consulta, a la raíz de la carpeta de clips.
- [x] 3. `enforceLimit` recibe `outputDir` en `opts`; `aplicarLimite` (`index.ts`) le pasa
      `manager.outputDir()`.
- [x] 4. Gates: type-check, lint y suite completa verdes (85 archivos, 1087 tests).

## Cierre

- [x] Aprobación del owner
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
