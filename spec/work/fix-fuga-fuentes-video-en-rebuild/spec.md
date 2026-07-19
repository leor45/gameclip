# Spec — Las fuentes de vídeo se acumulan en cada reconstrucción del pipeline

**Tipo:** Fix
**Rama:** `fix/fuga-fuentes-video-en-rebuild`
**Fecha:** 2026-07-18

## Problema / Objetivo

Cada reconstrucción del pipeline deja viva la fuente de vídeo de la anterior. libobs las renumera al
chocar los nombres, así que a lo largo de una sesión se acumulan `gameclip-monitor 2`, `3`, `4`… y
`gameclip-game 2`, `3`… en vez de haber siempre una sola con su nombre limpio.

Se ve en los logs de libobs de dos máquinas distintas (AMD + x264 y NVIDIA + nvenc), así que no es
del entorno:

```
Attempted to insert context with duplicate name "gameclip-scene"! Name has been changed to "gameclip-scene 2"
Attempted to insert context with duplicate name "gameclip-monitor"! Name has been changed to "gameclip-monitor 2"
...
OBS_API::destroyOBS_API timeout waiting for sources to be released. 9 sources remaining
	9 source(s) were remaining
```

Las nueve que quedaban vivas al cerrar eran **exactamente** las de vídeo de toda la sesión
(`gameclip-monitor`, `gameclip-game`, `gameclip-monitor 2`, `gameclip-game 2`, …). Ninguna de audio.

### Causa raíz

`buildPipeline` mete la fuente de vídeo en la escena con `scene.add(input)`
(`src/main/capture/obs.ts`), y el `OsnSceneItem` que devuelve solo se usa para `applyBounds`: se
descarta después. En `teardownPipeline` se sueltan los inputs (`input.release()`) y la escena
(`scene.release()`), pero **nunca se elimina el scene item**.

El scene item mantiene su propia referencia a la fuente. Con `input.release()` soltamos la nuestra,
pero la del item sigue ahí, así que el `obs_source_t` nunca llega a refcount 0 y no se destruye.

El audio no sufre el problema porque no pasa por la escena: va a canales de salida globales
(`osn.Global.setOutputSource(channel, src)`) y el teardown los anula uno a uno con
`setOutputSource(channel, null)`, que sí suelta la referencia.

Es decir: la fuga es de las fuentes que viven **en la escena**, y viene de que el ciclo de vida del
scene item no se cierra.

No se le atribuye ningún síntoma visible al usuario. Se arregla porque es una fuga real de recursos
que además ensucia los logs justo donde hay que leerlos para diagnosticar los clips negros.

## Alcance

**Dentro:**
- Guardar los scene items del pipeline y eliminarlos en el teardown, antes de soltar la escena.
- Test de regresión que falla con el código actual y pasa con el arreglo.

**Fuera (explícito):**
- El matcher de ventana del game capture (`unknown` en HD2) → `fix/game-capture-ventana-sin-ejecutable`.
- Que el perfil de juego espere a la ventana en vez de al proceso (el bug del menú de LoL).
- Añadir comprobación de que la fuente de vídeo dé píxeles (fallback por clip negro).
- Reducir la cantidad de reconstrucciones del pipeline: se sigue reconstruyendo igual de a menudo,
  solo que ahora sin dejar basura detrás.

## Criterios de aceptación

- [ ] Tras varias reconstrucciones seguidas, el log de libobs **no** contiene ningún
      `Attempted to insert context with duplicate name "gameclip-monitor"` ni `"gameclip-game"`.
- [ ] Al cerrar la app, el log no reporta fuentes de vídeo pendientes
      (`N source(s) were remaining` con las `gameclip-monitor`/`gameclip-game`).
- [ ] Test de regresión: el teardown elimina todos los scene items, y lo hace **antes** de soltar la
      escena (después ya no se puede).
- [ ] La captura sigue funcionando: se graba y se ve imagen (verificado fuera de Helldivers 2, que
      tiene su propio bug abierto).
