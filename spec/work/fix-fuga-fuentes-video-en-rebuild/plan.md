# Plan — Las fuentes de vídeo se acumulan en cada reconstrucción del pipeline

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Cerrar el ciclo de vida del scene item, que hoy queda abierto.

`buildPipeline` ya construye un array local `items: OsnSceneItem[]` para pasárselo a `applyBounds`.
Ese array pasa a guardarse en el estado de la clase (`this.sceneItems`), igual que ya se hace con
`this.inputs` y `this.outputChannels`. En `teardownPipeline` se recorre y se llama a `item.remove()`
sobre cada uno.

**El orden importa** y es lo que fija el test: los items hay que eliminarlos **antes** de
`scene.release()`. Una vez soltada la escena ya no hay a quién pedirle que quite el item, y la
referencia se queda colgada — que es justo el bug de hoy.

El teardown queda así:

```
outputChannels → null      (suelta las fuentes de audio; ya existía)
sceneItems     → remove()  (suelta la referencia de la escena a la fuente de vídeo)  ← NUEVO
inputs         → release() (suelta NUESTRA referencia; ya existía)
scene          → release()
context        → destroy()
```

Con las dos referencias soltadas, el `obs_source_t` llega a refcount 0 y libobs lo destruye. La
siguiente reconstrucción encuentra el nombre libre y no hay renumeración.

El `remove()` va dentro del `try` best-effort que ya envuelve el teardown, con la misma lógica que
el resto: un release fallido no debe tumbar la app.

## Archivos / módulos afectados

- `src/main/capture/obs.ts`
  - Interfaz local `OsnSceneItem`: añadir `remove(): void` (ya existe en `ISceneItem` de osn, solo
    falta en nuestro tipado mínimo).
  - Campo `private sceneItems: OsnSceneItem[] = []`.
  - `buildPipeline`: guardar los items en el campo en vez de descartar el array local.
  - `teardownPipeline`: eliminar los items antes de soltar la escena, y vaciar el campo al final
    junto al resto del estado.
- `src/main/__tests__/obs-helpers.test.ts` — test de regresión del teardown.

## Decisiones y alternativas consideradas

- **Eliminar el scene item** en vez de confiar en que `scene.release()` cascadee. La evidencia dice
  que no cascadea: si lo hiciera, las fuentes no aparecerían en `sources remaining` al cerrar. Es
  además lo que hace el propio OBS Studio al desmontar una escena.
- **Guardar los items en la clase** en vez de recorrer la escena en el teardown para redescubrirlos.
  Nuestro tipado mínimo de `OsnScene` no expone la lista de items, y añadir esa superficie por un
  dato que ya tenemos en la mano no compensa.
- **No tocar el número de reconstrucciones.** Reconstruir menos sería otra tarea con su propio
  análisis (afecta al replay buffer y a su contenido); aquí solo se arregla la fuga.
- **Test sobre `teardownPipeline` con un osn falso**, siguiendo el patrón que ya usa
  `obs-helpers.test.ts` para `buildAudioSources` (instanciar `ObsCapture` y castear para llegar a lo
  privado). Montar un `buildPipeline` completo falso exigiría fingir contexto de vídeo, encoders y
  salidas: mucho andamiaje para cubrir el mismo comportamiento.

## Riesgos

- **`remove()` sobre un item cuya escena ya no existe.** No debería pasar con el orden nuevo, pero el
  `try` best-effort del teardown lo cubre igual.
- **Doble liberación.** Eliminar el item suelta la referencia de la escena, no la nuestra; el
  `input.release()` posterior sigue siendo correcto y necesario. Si se quitara uno de los dos, la
  fuente volvería a fugarse (o se liberaría de más).
- **Que la fuga tuviera algún efecto de estabilidad hoy desconocido.** Al arreglarla, las fuentes
  pasan a destruirse de verdad en cada rebuild; si alguna ruta dependía sin saberlo de que siguieran
  vivas, saldría aquí. Lo cubre la verificación manual (grabar y ver imagen tras varios rebuilds).

---

**Estado:** ✅ aprobado el 2026-07-18 — el owner delegó la aprobación explícitamente
("auto apruébate, constrúyelo y verifica con los logs").
