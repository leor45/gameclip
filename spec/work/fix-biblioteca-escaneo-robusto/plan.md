# Plan — El escaneo de la biblioteca: carpetas ilegibles, grabación en curso y unidades sin montar

> **Este plan es un contrato.** Diseño fijado con el owner al encargar el fix (auditoría D5,
> hallazgos confirmados por un referee independiente).

## Enfoque

1. `src/main/library/manager.ts`:
   - `mediaFilesIn`: `readdirSync` en try/catch (carpeta ilegible → `[]`, el recorrido sigue con las
     hermanas) y `CARPETAS_DE_SISTEMA` (`$recycle.bin`, `system volume information`) comparadas en
     minúsculas.
   - `reconcile`, bajas: `accesibilidadDeUnidades()` hace `existsSync(parse(ruta).root)` memorizado
     por raíz (clave en minúsculas) durante la pasada; la fila se da de baja solo si la unidad es
     accesible **y** el archivo no existe. La unidad se mira primero.
   - `reconcile`, altas: el `statSync` del archivo nuevo en try/catch → se salta.
2. `src/main/library/settings-sync.ts` (nuevo): `syncLibraryAfterSettings({ library, capture,
   aplicarLimite })` con el cuerpo del listener: `outputDir()` → `reconcile` (solo si
   `capture.getStatus().state !== 'recording'`) → `relabelGames` → `aplicarLimite`, cada paso en su
   try/catch y todo dentro de otro.
3. `src/main/index.ts`: el listener de `'settings'` llama a `syncLibraryAfterSettings`; la migración
   y el escaneo del arranque, en try/catch separados con `console.error`.

## Archivos / módulos afectados

- `src/main/library/manager.ts`
- `src/main/library/settings-sync.ts` (nuevo)
- `src/main/index.ts`
- `src/main/__tests__/library-reconcile.test.ts` (nuevo; `node:fs` espiable para simular
  EPERM/ENOENT sin tocar permisos reales)
- `src/main/__tests__/library-settings-sync.test.ts` (nuevo)

## Decisiones y alternativas consideradas

- **La raíz del volumen** (`path.parse(ruta).root`) como prueba de «unidad disponible», frente a
  mirar la carpeta padre o la de salida: con la carpeta padre, borrar en el Explorador la carpeta
  entera de un juego dejaría sus filas para siempre. `parse` da `D:\` y, en UNC,
  `\\servidor\recurso\` (medido).
- **Raíz primero, archivo después:** el resultado es el mismo que mirando el archivo primero (baja ⇔
  unidad accesible y archivo ausente), pero una unidad de red caída, que tarda en contestar cada
  consulta, cuesta una espera por pasada y no una por clip. Coste en el caso normal: un `existsSync`
  más por unidad y pasada.
- **Sin raíz reconocible → se conserva** (en la duda, no se borra). Las rutas del catálogo son
  canónicas (`path.resolve`), siempre absolutas, así que no se da en la práctica.
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
  registro. Bajar el límite grabando
  sigue limpiando al momento, como antes.
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

- **El catálogo no encoge solo si una unidad no vuelve nunca:** sus filas quedan (con miniatura)
  hasta borrarlas a mano; `deleteClip` sobre una unidad inexistente funciona (`rmSync` con `force` no
  lanza, medido). Aceptado: es el precio de no perder ediciones.
- **Límite de almacenamiento con la unidad sin montar:** las filas conservadas cuentan para el límite,
  igual que con la unidad montada. Si se supera, `enforceLimit` puede «borrar» las más viejas: el
  archivo sigue en el USB (`rmSync` no hace nada) pero la fila se va, y al volver la unidad se
  re-cataloga como `scan`. Es la política que el owner configuró (con la unidad montada se borraría
  de verdad) y antes del fix esas filas se perdían siempre al arrancar; `StorageManager` no se toca.
- **Misma letra, otra unidad** (otro USB recibe la letra) o **volumen montado en carpeta** y
  desmontado: la raíz es accesible y las filas se dan de baja como antes. Límite conocido de usar la
  raíz del volumen.
- **Rutas con prefijo `\\?\`:** Node no ve la raíz `\\?\D:\` (`existsSync` → false, medido), así que
  esas filas nunca se darían de baja. La app no genera esas rutas (salen del selector de carpetas o
  de `Videos\GameClip`).
- **Ventanas residuales de D5-BUG-2** (ver «Fuera» del spec): el arranque de la salida de libobs y el
  guardado de un replay; exigen que un guardado de ajustes coincida con ellas en uno o dos segundos.

---

**Estado:** ✅ aprobado el 2026-10-09
