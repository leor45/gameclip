# Spec — El clip sale negro en perfil de juego

**Tipo:** Fix
**Rama:** `fix/game-capture-negro`
**Fecha:** 2026-07-12

## Problema / Objetivo

Con un juego detectado (perfil `game`), la grabación sale **completamente negra**. El resto funciona:
los hotkeys responden, el overlay aparece y el clip se guarda — pero sin imagen.

### Causa raíz

La introdujo `feature/captura-escritorio-vs-juego` (commit `58f9c7c`, v0.2.0). Al pasar la escena a
una sola fuente de vídeo, el `game_capture` del perfil de juego se configura en **modo ventana** con
`window: '::<exe>'` y `priority: 2` (`gameCaptureSettings`, `src/main/capture/obs.ts`).

**Ese formato abreviado no matchea ninguna ventana en las fuentes de vídeo de libobs.** El source
espera la cadena completa `título:clase:ejecutable`, la misma que expone en su propiedad-lista
`window`. Con `::<exe>` no engancha nada, y como la escena ya no lleva el monitor de fondo, el
resultado es un lienzo negro.

Verificado en máquina real (sonda con *Marvel's Spider-Man: Miles Morales* corriendo):

| Fuente | Resultado |
|---|---|
| `game_capture` `any_fullscreen` | 2560×1440 — captura |
| `game_capture` ventana con `::MilesMorales.exe` | **0×0 — negro** |
| `game_capture` ventana con `Marvel's…#3A…:GameNxApp:MilesMorales.exe` | 2560×1440 — captura |
| `window_capture` WGC con la cadena completa | 2560×1440 — captura |

El engaño estaba en que `::<exe>` **sí funciona** para el audio por proceso
(`wasapi_process_output_capture`, `processCaptureSettings`): es otro matcher. De ahí se copió el
formato al vídeo, donde no vale. Es el mismo patrón que el bug del monitor equivocado: la propiedad
hay que **resolverla contra la lista que expone el propio source** (`resolveMonitorId`).

## Alcance

**Dentro:**
- Resolver la ventana del juego contra la propiedad-lista `window` del `game_capture` (helper puro,
  como `resolveMonitorId`), y configurar el source con la **cadena completa**.
- Si no se encuentra la ventana (el juego aún no la ha creado, o el proceso no tiene ventana visible),
  caer a `any_fullscreen`, que engancha los juegos a pantalla completa — nunca dejar la escena vacía.
- Re-apuntar en caliente (`updateGameCaptureTarget`) resolviendo igual: al rotar de juego, el vídeo
  debe seguir al nuevo.
- Test de regresión **primero** (rojo → verde) con los items reales de la máquina.

**Fuera (explícito):**
- No se cambia el perfil de captura ni el reparto de audio (v0.2.0 y v0.2.1 se quedan como están).
- No se sustituye `game_capture` por `window_capture`: el hook engancha bien (lo prueba la sonda), y
  el game capture es el que soporta pantalla completa exclusiva.
- No se detectan juegos sin ventana visible: no hay nada que capturar en ese caso.

## Criterios de aceptación

- [ ] Con un juego real corriendo (ventana sin bordes), el clip del perfil de juego **muestra el
      juego**, no un lienzo negro.
- [ ] Test de regresión: resolver la ventana de un juego contra los items reales de libobs devuelve
      la cadena completa `título:clase:exe`, nunca `::<exe>`.
- [ ] Sin ventana que resolver, el source se configura en `any_fullscreen` (no queda apuntando a una
      ventana inexistente).
- [ ] Gates verdes: type-check · lint · tests.
