# Spec — Si un juego pasa de su lanzador al exe real, la captura no le sigue

**Tipo:** Fix
**Rama:** `fix/juego-cambia-de-exe`
**Fecha:** 2026-10-09

## Problema / Objetivo

Auditoría bug-hunter D, D4-BUG-1 (Low, confirmado por el árbitro). Hay juegos que arrancan con un
lanzador indexado bajo el **mismo nombre** que el juego (`PlayRDR2.exe`, el `start_protected_game.exe`
de Easy Anti-Cheat…): primero corre el lanzador, luego arranca el exe real y el lanzador se cierra. La
app detecta el juego por el lanzador y, cuando este deja paso al exe real, la captura de vídeo y el
audio del juego (modo apps) **se quedan apuntando al lanzador toda la sesión**.

**Causa raíz:** dos comparaciones solo por nombre.

- `GameDetector.setChanged` comparaba únicamente los **nombres** de los juegos. Con el mismo juego y
  otro ejecutable no emitía `games-changed`, así que el manager nunca se enteraba del exe nuevo.
- `CaptureManager.applyActiveGame` solo re-apuntaba las fuentes al cambiar el **nombre** del juego
  activo (`rotacionDeJuego` exigía `changed`). Aunque le llegara el exe nuevo, no hacía nada con él.

Además, `findRunningGamesMatch` se queda con el primer proceso de cada juego en el orden de
`tasklist`: con lanzador y exe real vivos a la vez, el elegido podría saltar de uno a otro entre
sondeos. Arreglado solo lo anterior, cada salto re-apuntaría la captura (parpadeo).

## Alcance

**Dentro:**
- Detector: ejecutable **pegajoso** por juego — si el exe confirmado de un juego sigue vivo y sigue
  resolviéndose como ese juego, se conserva; si no, vale el del matching.
- Detector: `games-changed` también cuando cambia el ejecutable de algún juego (no solo el conjunto de
  nombres).
- Manager: mismo nombre con otro exe → re-apuntado en caliente igual que una rotación de juego
  (`updateGameCaptureTarget` en perfil de juego sin rebuild reciente; `updateGameAudioTarget` con la
  misma condición `audioMode === 'apps' && gameAudioEnabled`), y se rearranca el bucle de re-apuntado
  a la ventana (el exe recién llegado suele crear su ventana después del proceso).
- Sin rebuild, sin tocar la grabación (manual o de sesión del modo auto), sin cambio de
  `detectedGame` en el estado.
- Tests de regresión (detector y manager).

**Fuera (explícito):**
- `findRunningGamesMatch` y sus otros llamadores: sin cambios.
- Un lanzador que sigue vivo **toda** la sesión junto al exe real: con el pegajoso se sigue con el
  lanzador (igual que hoy). Distinguir «el exe real» exigiría otra señal (ventana, consumo) y es otra
  tarea.
- La segunda vía de calificación de FPS del overlay (`perfSampler.setDetectedGame`) se refresca con
  cada `status`; en modo auto grabando, el exe nuevo le llega en el siguiente cambio de estado. No se
  añade un evento nuevo para eso.

## Criterios de aceptación

- [x] Lanzador → (lanzador + real) → real: el detector emite una vez con el lanzador y otra con el exe
      real, sin emisión mientras conviven (ni aunque `tasklist` cambie el orden).
- [x] El pegajoso suelta un exe que ya no se resuelve como ese juego (re-índice / manual editado) y
      nunca deja un mismo exe bajo dos juegos.
- [x] Perfil de juego, mismo nombre y otro exe: `updateGameCaptureTarget('real.exe')`, sin rebuild, el
      buffer intacto y `detectedGame` sin cambios.
- [x] Modo auto con la sesión grabando: no se corta ni se rearranca la grabación.
- [x] `audioMode: 'apps'` religa el audio; `'desktop'` no llama a `updateGameAudioTarget`.
- [x] Grabación manual en curso: re-apuntado en caliente y la grabación sigue entera.
- [x] Los cambios de nombre se comportan exactamente igual que antes (suite existente verde).
- [x] Suite verde.
