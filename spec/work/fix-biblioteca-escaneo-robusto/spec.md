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
  mismo fallo de D5-BUG-1 un nivel más abajo); una fila solo se da de baja si falta su archivo **y**
  la raíz de su volumen (`D:\`, `\\servidor\recurso\`) es accesible, mirada una vez por unidad y
  pasada.
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
- Que el límite de almacenamiento ignore los clips de una unidad sin montar (ver Riesgos del plan).
- El coste del escaneo recursivo de una unidad entera cuando la carpeta de clips es su raíz y tiene
  mucho más que clips: diseño de la Fase 10, no de este fix.
- Purgar solas las filas de una unidad que no vuelve nunca: se quitan a mano desde la biblioteca.

## Criterios de aceptación

- [ ] Una subcarpeta sin permiso (o la carpeta de clips entera) no hace lanzar al escaneo; lo legible
      se cataloga.
- [ ] La papelera y `System Volume Information` no se catalogan, en ninguna capitalización.
- [ ] Un archivo que desaparece entre el listado y el `stat` se salta sin abortar el escaneo.
- [ ] Un clip de una unidad no montada conserva fila, título, etiquetas, favorito, pistas muteadas y
      miniatura; en una unidad montada, el clip borrado se sigue dando de baja.
- [ ] Una unidad caída cuesta una consulta a su raíz por pasada, no una por clip.
- [ ] Guardar ajustes grabando no cataloga la grabación en curso; el re-etiquetado y el límite siguen
      corriendo.
- [ ] Un fallo del escaneo, del re-etiquetado o del límite no sale del listener de `'settings'`: el
      guardado y el rebuild siguen.
- [ ] Un fallo de la migración o del escaneo inicial no deja la app sin biblioteca.
- [ ] Suite verde.
