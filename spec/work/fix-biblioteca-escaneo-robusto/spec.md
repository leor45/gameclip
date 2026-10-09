# Spec — El escaneo de la biblioteca: carpetas ilegibles, grabación en curso y unidades sin montar

**Tipo:** Fix
**Rama:** `fix/biblioteca-escaneo-robusto`
**Fecha:** 2026-10-09

## Problema / Objetivo

Auditoría bug-hunter D, tres hallazgos Medium del escaneo de la biblioteca
(`LibraryManager.reconcile`) y de quien lo llama (`setupLibrary` en `src/main/index.ts`), confirmados
por un referee independiente.

- **D5-BUG-1 — una carpeta ilegible tumba la biblioteca y los ajustes.** Con la carpeta de clips en la
  raíz de una unidad (`E:\`, el selector lo permite), el recorrido recursivo llega a
  `E:\System Volume Information` y `readdirSync` lanza `EPERM` (medido en la máquina del owner). Al
  arrancar, la excepción sale de `setupLibrary` y la app se queda sin biblioteca; y como el listener
  de `'settings'` ya estaba colgado del manager, a partir de ahí **cada guardado de ajustes** lanza
  dentro del `emit('settings')` de `CaptureManager.setSettings` y se aborta antes del rebuild del
  pipeline (y antes del resto de listeners: atajos, overlay, auto-arranque…). Además `$RECYCLE.BIN`
  sí se deja leer (medido): el escaneo catalogaba los videos de la papelera.
  **Causa raíz:** `mediaFilesIn` no maneja errores de `readdirSync` ni excluye las carpetas de
  sistema; ni el arranque ni el listener aíslan un fallo del escaneo.
- **D5-BUG-2 — guardar ajustes grabando deja una fila fantasma.** Durante una grabación (manual o de
  sesión automática) libobs escribe el MP4 en la RAÍZ de la carpeta y la captura lo mueve a
  `<Juego|Desktop>/` al parar. El listener de `'settings'` escanea en cada guardado (basta el atajo
  del overlay de rendimiento): catalogaba el archivo a medio escribir como `scan`; tras la
  reubicación quedaba una fila con la ruta vieja y el tamaño parcial hasta el siguiente escaneo, y
  `aplicarLimite` contaba ese tamaño (el auto-borrado podía llevarse un clip viejo que no tocaba).
  **Causa raíz:** el listener escanea sin mirar el estado de la captura.
- **D5-BUG-3 — una unidad sin montar borra del catálogo sus clips.** `reconcile` da de baja toda fila
  cuyo archivo no existe, sin distinguir «borrado» de «unidad no disponible» (un USB, o una unidad de
  red que aún no conectó al arrancar con Windows). Se perdían para siempre títulos, etiquetas,
  favoritos y pistas muteadas.
  **Causa raíz:** `existsSync(archivo) === false` se toma como prueba de borrado.

## Alcance

**Dentro:**
- `mediaFilesIn`: salta `$RECYCLE.BIN` y `System Volume Information` (sin distinguir mayúsculas y a
  cualquier profundidad: un volumen montado en una carpeta trae las suyas); una carpeta que no se
  deja leer —incluida la propia carpeta de clips— se salta sin cortar el recorrido.
- `reconcile`: un archivo que desaparece o no se deja leer entre el listado y el `stat` se salta (el
  mismo fallo de D5-BUG-1 un nivel más abajo); una fila cuyo archivo falta se conserva solo si vive
  en la unidad de la carpeta de clips y la raíz de esa unidad (`D:\`, `\\servidor\recurso\`) no es
  accesible (ver «Corrección tras revisión (B1-1)»).
- `StorageManager` (`getStats`, `enforceLimit`): los clips de la unidad de la carpeta de clips, si no
  está montada, ni cuentan ni se borran; solo se consulta esa raíz (B1-1, 1.2).
- El listener de `'settings'` pasa a `src/main/library/settings-sync.ts`
  (`syncLibraryAfterSettings`, testeable): no escanea con la captura en `'recording'` y nunca lanza
  (cada paso aislado y registrado con `console.error`).
- Arranque (`setupLibrary`): la migración del layout y el escaneo inicial, cada uno en su try/catch;
  un fallo se registra y la biblioteca abre igual.
- Tests de regresión.

**Fuera (explícito):**
- Escanear al terminar la grabación lo que se saltó durante ella: un cambio de carpeta de salida
  hecho grabando se ve en el siguiente guardado de ajustes sin grabación o al reiniciar.
- Las ventanas cortas en que libobs ya escribe en la raíz y el estado aún no es `'recording'`
  (arranque de la salida) o no lo es nunca (guardado de un replay + remux de nombres de pista):
  cerrarlas exige que `CaptureManager` exponga «hay una operación de captura en curso».
- El coste del escaneo recursivo de una unidad entera cuando la carpeta de clips es su raíz y tiene
  mucho más que clips: diseño de la Fase 10, no de este fix.
- Conservar las filas de una carpeta de salida **anterior** cuya unidad no está: se dan de baja como
  antes del fix (B1-1).
- Purgar solas las filas de la unidad de la carpeta de clips si esa unidad no vuelve nunca: se quitan
  a mano desde la biblioteca o al cambiar de carpeta.

## Criterios de aceptación

- [ ] Una subcarpeta sin permiso (o la carpeta de clips entera) no hace lanzar al escaneo; lo legible
      se cataloga.
- [ ] La papelera y `System Volume Information` no se catalogan, en ninguna capitalización.
- [ ] Un archivo que desaparece entre el listado y el `stat` se salta sin abortar el escaneo.
- [ ] Con la unidad de la carpeta de clips sin montar, sus clips conservan fila, título, etiquetas,
      favorito, pistas muteadas y miniatura; en una unidad montada, el clip borrado se sigue dando de
      baja.
- [ ] Con la unidad de la carpeta de clips caída, se consulta su raíz una vez por pasada y ningún
      archivo suyo.
- [ ] Las filas de otra unidad que no está (carpeta de salida anterior) se dan de baja: copiar la
      carpeta a otra unidad y quitar el USB no duplica la biblioteca (B1-1).
- [ ] El uso medido y el auto-borrado ignoran los clips de la unidad de la carpeta de clips sin
      montar (ni cuentan ni se borran) y cuentan los de otras unidades como siempre (B1-1, 1.2).
- [ ] Con la carpeta de clips en la raíz de un recurso compartido (`\\nas\clips`, sin barra final, o
      `//nas/clips`), sus clips se conservan con el recurso caído (1.1).
- [ ] `getStats` y `enforceLimit` no consultan el disco de ninguna unidad salvo la de la carpeta de
      clips (1.2).
- [ ] Guardar ajustes grabando no cataloga la grabación en curso; el re-etiquetado y el límite siguen
      corriendo.
- [ ] Un fallo del escaneo, del re-etiquetado o del límite no sale del listener de `'settings'`: el
      guardado y el rebuild siguen.
- [ ] Un fallo de la migración o del escaneo inicial no deja la app sin biblioteca.
- [ ] Suite verde.

## Corrección tras revisión (B1-1)

Una revisión de regresiones independiente encontró un fallo **introducido** por la primera versión
de este fix (Medium). Conservar toda fila cuya unidad no está duplicaba la biblioteca para siempre en
este caso: el owner graba en el USB `E:\Clips`, copia la carpeta a `D:\Clips` con el Explorador, quita
el USB para siempre y apunta GameClip a `D:\Clips`. Las filas de `E:` no se iban nunca y el escaneo
añadía cada archivo de `D:` como `scan`: cada clip salía dos veces (uno muerto). Además
`StorageManager.enforceLimit` sumaba las dos copias. Como el Explorador conserva el mtime, las muertas
y las reales se intercalan de la más vieja a la más nueva, así que se borraban archivos reales de `D:`
con el uso real por debajo del límite (p. ej. 40 GB reales y límite de 50 GB → se medían 80 GB → caían
~15 GB de clips reales). Antes del fix las filas de `E:` se daban de baja al arrancar y esto no pasaba.

**Causa raíz:** la regla «unidad no accesible → se conserva» no distinguía la unidad de la carpeta de
clips (el caso de D5-BUG-3) de la de una carpeta de salida anterior; y el límite y las estadísticas
contaban filas que no ocupan espacio medible ni liberable.

## Segunda corrección tras revisión (1.1, 1.2)

Una tercera revisión independiente encontró dos fallos Low en la corrección B1-1 (detalle en el plan):

- **1.1:** con la carpeta de clips en la raíz de un recurso compartido (el selector la da como
  `\\nas\clips`, sin barra final) no se reconocía su unidad y, con el recurso caído, sus clips se
  daban de baja. **Causa raíz:** `path.parse` deja esa raíz sin `\` final y las filas la llevan.
- **1.2:** `getStats` y `enforceLimit`, que corren en el hilo principal, consultaban la raíz de cada
  unidad del catálogo; un recurso antiguo caído a mitad de sesión los bloqueaba segundos (42 s con el
  servidor apagado). **Causa raíz:** dejaban fuera las filas de cualquier unidad no accesible, cuando
  el escaneo solo conserva las de la unidad de la carpeta de clips.
