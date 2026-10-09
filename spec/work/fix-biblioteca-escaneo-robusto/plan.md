# Plan — El escaneo de la biblioteca: carpetas ilegibles, grabación en curso y unidades sin montar

> **Este plan es un contrato.** Diseño fijado con el owner al encargar el fix (auditoría D5,
> hallazgos confirmados por un referee independiente). La corrección B1-1 (al final) la decidió el
> coordinador tras la revisión de regresiones.

## Enfoque

1. `src/main/library/manager.ts`:
   - `mediaFilesIn`: `readdirSync` en try/catch (carpeta ilegible → `[]`, el recorrido sigue con las
     hermanas) y `CARPETAS_DE_SISTEMA` (`$recycle.bin`, `system volume information`) comparadas en
     minúsculas.
   - `reconcile`, bajas: una fila cuyo archivo falta se conserva solo si vive en la unidad de la
     carpeta de clips y esa unidad no está montada (`createOfflineOutputVolumeCheck`); en ese caso no
     se pregunta por el archivo. El resto, como antes del fix: baja si falta el archivo.
   - `reconcile`, altas: el `statSync` del archivo nuevo en try/catch → se salta.
2. `src/main/library/clip-path.ts`: `volumeRootKey(ruta)` (raíz de `path.parse` con `\`, acabada en
   `\` y en minúsculas), `createVolumeAccessCheck()` (`existsSync` de la raíz, memorizado por raíz) y
   `createOfflineOutputVolumeCheck(outputDir)` (¿el clip vive en la unidad de la carpeta de clips y
   no está montada? Una sola consulta al disco, a la raíz de la salida). Compartidos por el catálogo
   y el almacenamiento, que así no pueden discrepar.
3. `src/main/library/storage-manager.ts`: `getStats(outputDir)` y `enforceLimit(settings,
   { outputDir })` dejan fuera los clips de la unidad de la carpeta de clips cuando no está montada;
   las filas de otras unidades cuentan como siempre, sin consultar su disco (B1-1, 1.2).
4. `src/main/library/settings-sync.ts` (nuevo): `syncLibraryAfterSettings({ library, capture,
   aplicarLimite })` con el cuerpo del listener: `outputDir()` → `reconcile` (solo si
   `capture.getStatus().state !== 'recording'`) → `relabelGames` → `aplicarLimite`, cada paso en su
   try/catch y todo dentro de otro.
5. `src/main/index.ts`: el listener de `'settings'` llama a `syncLibraryAfterSettings`; la migración
   y el escaneo del arranque, en try/catch separados con `console.error`; `aplicarLimite` pasa
   `outputDir: manager.outputDir()` a `enforceLimit`.

## Archivos / módulos afectados

- `src/main/library/manager.ts`
- `src/main/library/clip-path.ts`
- `src/main/library/storage-manager.ts`
- `src/main/library/settings-sync.ts` (nuevo)
- `src/main/index.ts`
- `src/main/__tests__/library-reconcile.test.ts` (nuevo; `node:fs` espiable para simular
  EPERM/ENOENT sin tocar permisos reales)
- `src/main/__tests__/library-settings-sync.test.ts` (nuevo)
- `src/main/__tests__/storage-manager.test.ts`

## Decisiones y alternativas consideradas

- **La raíz del volumen** (`path.parse(ruta).root`) como prueba de «unidad disponible», frente a
  mirar la carpeta padre o la de salida: con la carpeta padre, borrar en el Explorador la carpeta
  entera de un juego dejaría sus filas para siempre. `parse` da `D:\` y, en UNC,
  `\\servidor\recurso\` (medido).
- **En la unidad de la salida, la raíz antes que el archivo:** sin montar, sus clips se conservan sin
  una consulta por clip. La primera consulta a un recurso de red caído tarda ~4 s y Windows recuerda
  la respuesta negativa un tiempo (las siguientes, ~0 ms; medido), así que el ahorro real es acotado,
  pero no cuesta nada. Coste en el caso normal: un `existsSync` más por pasada.
- **Lo que no se puede comprobar cuenta como accesible:** una ruta sin raíz, o con prefijo `\\?\` o
  `\\.\` (Node no ve `\\?\D:\` aunque la unidad esté: `existsSync` → false, medido), se trata como
  antes del fix. Al revés, esas filas nunca se darían de baja y quedarían fuera del límite.
- **`existsSync` y no `statSync({ throwIfNoEntry: false })`** para «falta el archivo»: se valoró
  distinguir ENOENT de otros errores, pero lo medido (una ruta dentro de `System Volume Information`)
  ya da ENOENT; no hay un caso real que justifique el cambio.
- **Carpetas de sistema a cualquier profundidad:** solo existen en la raíz de un volumen, pero un
  volumen montado en una carpeta trae las suyas; una carpeta de usuario con ese nombre no es realista.
- **El `stat` de las altas en try/catch** (además del `readdirSync` pedido): es el mismo fallo un
  nivel más abajo; un archivo borrado en el Explorador entre el listado y el `stat` abortaba el
  escaneo entero.
- **Grabando no se escanea, pero `relabelGames` y `aplicarLimite` sí corren.** `enforceLimit` solo
  recorre `library.list()` (filas del catálogo) y la grabación en curso no está catalogada:
  `CaptureManager` la registra al pararla, y lo único que la catalogaba a mitad era el escaneo que
  ahora se salta. El estado sigue en `'recording'` durante todo `doStopRecording` /
  `stopSessionRecording` (stop de libobs → remux → reubicación → `settleAfterRecording`) y pasa a
  `buffering`/`idle` en el mismo tick en que se emite `'clip-saved'`, cuyo `registerSavedClip`
  inserta la fila sin ningún `await` previo: el escaneo no puede colarse entre la reubicación y el
  registro. Bajar el límite grabando sigue limpiando al momento, como antes.
- **No reprogramar al terminar la grabación el escaneo saltado:** colgarlo de `'status'` lo correría
  antes de `'clip-saved'` y el clip quedaría como `scan` en vez de `recording` (cambian las
  estadísticas y «solo borrar grabaciones»); colgarlo de `'clip-saved'` no cubre una parada fallida.
- **Pasos aislados en el listener** frente a un único try/catch: que falle el escaneo no debe impedir
  aplicar un límite recién bajado.
- **Extraer el listener** a `settings-sync.ts`: `index.ts` no se puede probar (Electron); el listener
  queda en una línea.
- **Migración y escaneo del arranque en try/catch separados:** un fallo típico de la migración
  (`readdirSync` del viejo `Capturas/`) llega cuando los clips ya se movieron; escanear después es
  seguro.

## Riesgos

- **Si la unidad de la carpeta de clips no vuelve nunca,** sus filas quedan (con miniatura) mientras
  siga siendo la carpeta de clips; se quitan a mano (`deleteClip` sobre una unidad inexistente
  funciona: `rmSync` con `force` no lanza, medido) o solas al apuntar GameClip a otra unidad.
- **Clips de una carpeta de salida anterior en un USB desenchufado un rato:** se dan de baja (con sus
  ediciones), como antes del fix, y no vuelven solos porque el escaneo solo recorre la carpeta actual.
  Es el precio de no duplicar la biblioteca (B1-1).
- **Misma letra, otra unidad** (otro USB recibe la letra) o **volumen montado en carpeta** y
  desmontado: la raíz es accesible y las filas se dan de baja como antes. Límite conocido de usar la
  raíz del volumen.
- **Una carpeta de clips y sus filas con distinta forma de la misma unidad** (unidad mapeada `Z:` y
  su ruta UNC): no se reconocen como la misma unidad y, sin montar, las filas se dan de baja como
  antes del fix. El selector de carpetas y libobs escriben siempre la misma forma.
- **`getStats` y `enforceLimit` consultan la raíz de la carpeta de clips** una vez por llamada (solo
  si algún clip vive en ella). Con esa unidad en un recurso de red caído, la primera consulta tarda
  segundos; `getStats` ya consultaba ese mismo disco (`nearestExistingDir` + `statfsSync`) y el
  escaneo también, así que no es una clase de bloqueo nueva. Ninguna otra unidad se consulta.
- **Ventanas residuales de D5-BUG-2** (ver «Fuera» del spec): el arranque de la salida de libobs y el
  guardado de un replay; exigen que un guardado de ajustes coincida con ellas en uno o dos segundos.

## Corrección tras revisión (B1-1)

La primera versión conservaba **toda** fila cuya unidad no estaba y el límite las seguía contando. Con
la carpeta del USB copiada a otra unidad y el USB quitado, la biblioteca quedaba duplicada para
siempre y el auto-borrado medía el doble y borraba clips reales (ver spec). Corrección:

1. `reconcile` solo conserva una fila sin archivo si su unidad es **la de la carpeta de clips** y no
   está montada (comparación de raíces sin mayúsculas ni tipo de barra). Las filas de otra unidad
   ausente se dan de baja como antes del fix (sin la consulta previa a la raíz).
2. `getStats` y `enforceLimit` ignoran las filas cuya unidad no es accesible: ni cuentan ni son
   candidatas a borrar («borrarlas» no libera nada y destruye las ediciones que D5-BUG-3 protege).
3. El helper pasa a `clip-path.ts` (`createVolumeAccessCheck`, `volumeRootKey`), compartido.
   Además, lo que no se puede comprobar (`\\?\`, `\\.\`, sin raíz) cuenta como accesible: sin esto, el
   paso 2 sacaba del límite para siempre las rutas con prefijo, y el paso 1 podía borrar la fila de
   una de ellas aunque su archivo existiera.

Alternativas descartadas: conservar las filas de otra unidad ausente solo si no hay copia en la
carpeta actual (reconocer «copia» exige comparar nombre, tamaño y fecha, y sigue duplicando si se
renombró); purgar tras N días sin ver la unidad (necesita persistir fechas por unidad).

## Segunda corrección tras revisión (1.1, 1.2)

Una tercera revisión independiente encontró dos fallos Low en la corrección B1-1:

- **1.1 — carpeta de clips en la raíz de un recurso compartido.** El selector devuelve `\\nas\clips`
  sin barra final y `path.parse` deja la raíz así, mientras que las filas canónicas dan
  `\\nas\clips\`: las claves no coincidían y se perdía la protección de D5-BUG-3 (reproducido:
  `outputDir = \\localhost\noexiste` → fila dada de baja; con barra final o una subcarpeta, se
  conservaba). **Corrección:** `volumeRootKey` devuelve siempre la raíz acabada en `\` (si no está
  vacía); de paso `D:` pasa a `d:\`. La comprobación de acceso usa la misma raíz normalizada.
- **1.2 — bloqueo nuevo del hilo principal.** `getStats` (IPC síncrono, en cada `library:changed`) y
  `enforceLimit` (tras cada `clip-saved`) hacían `existsSync` de la raíz de **cada** unidad del
  catálogo: un recurso antiguo que se cae a mitad de sesión bloqueaba la primera llamada (42 s
  medidos por el revisor con el servidor apagado, 4 s con un recurso inexistente). **Corrección:**
  como `reconcile` solo conserva filas sin archivo de la unidad de la carpeta de clips, el
  almacenamiento solo deja fuera esas y solo consulta esa raíz (`createOfflineOutputVolumeCheck`,
  compartido con `reconcile`). Las filas de otras unidades cuentan y son candidatas como en `main`,
  sin consultar su disco; las de una unidad que ya no está las da de baja el escaneo (al arrancar
  corre antes del primer auto-borrado).

**Cómo sabe `enforceLimit` la carpeta de clips:** un campo opcional `outputDir` en sus `opts`, que el
único llamador (`aplicarLimite` en `index.ts`) rellena con `manager.outputDir()` —la carpeta ya
resuelta, con el valor por defecto si el ajuste está vacío—. Es lo menos invasivo y simétrico con
`getStats(outputDir)`, que ya la recibía del IPC. Se descartó una dependencia del constructor
(`() => string`): mezclaría dos formas de pasar lo mismo. Sin `outputDir`, `enforceLimit` no deja
fuera nada (comportamiento de `main`); hacerlo obligatorio obligaba a tocar todos los tests
existentes sin ganar seguridad (hay un solo llamador).

---

**Estado:** ✅ aprobado el 2026-10-09
