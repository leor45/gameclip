# Spec — Persistencia del overlay oculto y tarea elevada tras actualizar

**Tipo:** Fix
**Rama:** `fix/persistencia-overlay-y-tarea-elevada`
**Fecha:** 2026-07-22

## Problema / Objetivo

Hay dos regresiones relacionadas con la feature `feature-overlay-rendimiento`:

1. Si el overlay de rendimiento esta activo y el usuario lo oculta con el atajo configurable
   "Mostrar/ocultar overlay de rendimiento" (`Alt+R` por defecto),
   al reiniciar la app o el PC vuelve a mostrarse. El atajo no desactiva el overlay, pero el estado de
   vista oculto/visible debe sobrevivir a reinicios.
2. Si "Iniciar con Windows como administrador" esta activo, la tarea programada queda apuntando al
   `.exe` portable usado al crearla. Al actualizar la app, el nombre/ruta del portable cambia por la
   version, pero la tarea sigue lanzando el `.exe` anterior hasta que el usuario desactiva y vuelve a
   activar el ajuste.
3. Si "Iniciar con Windows como administrador" esta activo y el usuario abre manualmente el portable
   sin elevar, la app queda corriendo sin permisos aunque el ajuste expresa que GameClip debe operar
   como administrador para las metricas que lo requieren.

**Causa raiz 1:** `PerfOverlayController` guarda el estado `oculto` solo en memoria y `configure()` lo
reinicia a visible cuando el overlay se vuelve a crear. No existe ningun campo persistido que represente
"activo pero oculto".

**Causa raiz 2:** `applyElevatedChange()` solo crea/borra la tarea programada cuando cambia el booleano
`autoLaunchElevated`. En un arranque normal con el ajuste ya activo no valida ni actualiza el action
`/TR`, asi que no corrige la ruta tras una actualizacion del portable.

**Causa raiz 3:** al persistir el toggle de visibilidad, el evento `settings` re-registraba todos los
`globalShortcut` mientras la combinacion seguia pulsada. Windows volvia a entregar el autorepeat a la
tecla recien registrada, alternando el overlay en bucle y colgando la app.

**Causa raiz 4:** el opt-in elevado solo gobierna el arranque por tarea programada. El arranque manual
del portable no comprueba si el proceso actual ya esta elevado ni se relanza con `RunAs` cuando el
ajuste persistido pide administrador.

## Alcance

**Dentro:**
- Persistir el estado de vista del overlay de rendimiento (visible/oculto) separado de
  `perfOverlayEnabled`.
- Mantener la accion configurable "Mostrar/ocultar overlay de rendimiento" como toggle de
  visibilidad: no cambia las metricas ni desactiva el overlay.
- Al arrancar empaquetada con `autoLaunchElevated: true`, asegurar que la tarea programada elevada
  apunta al ejecutable real actual (`PORTABLE_EXECUTABLE_FILE` si existe, `process.execPath` si no).
- Evitar UAC innecesario en cada arranque: actualizar la tarea solo si no existe o si su action no
  coincide con el ejecutable actual.
- Al arrancar empaquetada con `autoLaunchElevated: true`, si el proceso no esta elevado, relanzar el
  ejecutable real actual con `RunAs` y cerrar la instancia no elevada.
- Mantener la limpieza de temporales: el relanzamiento debe ocurrir despues de la limpieza de arranque
  (`barrerTemporales(true)`) y el cierre normal debe seguir pasando por `will-quit`.
- Agregar tests de regresion para ambos bugs.
- No re-registrar atajos globales cuando cambia solo `perfOverlayVisible`.

**Fuera (explícito):**
- No se cambia el atajo por defecto ni la UI de configuracion de metricas.
- No se cambia el nombre de la tarea programada ni el mecanismo de elevacion.
- No se implementa soporte para instaladores/MSI ni migraciones de nombres antiguos de tarea.
- No se intenta preservar el estado oculto si el usuario desactiva el overlay desde Ajustes: al
  reactivarlo manualmente vuelve visible, como comportamiento intencional.
- No se intenta evitar el UAC en arranques manuales no elevados: Windows lo exige para relanzar con
  administrador. Si el usuario cancela el UAC, la app puede continuar sin elevar.
- No se cambia el sistema de limpieza temporal salvo el orden necesario para no saltarselo.

## Criterios de aceptación

Observables y verificables uno a uno:

- [x] Test de regresion: al alternar la visibilidad del overlay a oculto, el ajuste persistido queda
      en oculto sin cambiar `perfOverlayEnabled`.
- [x] Test de regresion: al crear/configurar el overlay con el estado persistido oculto, la ventana no
      se muestra aunque el overlay este activo; al pulsar el atajo vuelve a mostrarse.
- [x] Test de regresion: con `autoLaunchElevated` activo y una tarea existente apuntando a un exe
      anterior, el arranque decide actualizarla al exe actual.
- [x] Test de regresion: con `autoLaunchElevated` activo y una tarea ya correcta, el arranque no pide
      elevacion ni recrea la tarea.
- [x] En una build portable real, ocultar el overlay con el atajo configurado, cerrar/reiniciar la app
      y abrirla de nuevo mantiene el overlay oculto hasta disparar esa misma accion otra vez.
- [x] En una build portable real actualizada, con auto-inicio elevado activo, la tarea programada queda
      apuntando al `.exe` actual sin tener que desactivar/reactivar el ajuste.
- [x] Type-check, lint y tests verdes.
- [x] Una pulsacion del atajo configurable alterna una sola vez, sin parpadeo ni bloqueo de la app.
- [x] Test de regresion: un payload versionado anterior (`GameClip-<version>`) se considera basura
      aunque sea reciente, sin relajar la proteccion del staging `ns*.tmp` actual.
- [ ] Con `autoLaunchElevated` activo, abrir manualmente el portable sin administrador muestra UAC y
      relanza GameClip elevado; si ya se abrio como administrador, no relanza nada.
- [ ] El relanzamiento elevado no deja de ejecutar la limpieza temporal de arranque ni la de cierre.
