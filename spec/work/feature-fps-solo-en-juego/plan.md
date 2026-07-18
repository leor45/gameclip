# Plan — FPS solo cuando hay un juego, «—» en el escritorio

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

> **Release:** mismo release que `feature/overlay-rendimiento` y
> `feature/overlay-proteccion-selectiva`.

## Enfoque

El dato que hace falta **ya está llegando y lo estábamos tirando**: `PresentMode` es la columna 7 del
CSV de PresentMon 2.5.1 y viene en cada fila. No hay que capturar nada nuevo, ni añadir un proceso, ni
sondear el sistema — solo leer una columna más de líneas que ya parseamos. El coste en runtime es
indistinguible de cero.

La regla de calificación es una sola comparación de cadena: **el modo empieza por `Hardware`**. Cubre
`Hardware: Legacy Flip`, `Hardware: Legacy Copy to front buffer`, `Hardware: Independent Flip` y
`Hardware Composed: Independent Flip` — pantalla completa y ventana sin bordes. Deja fuera
`Composed: Flip`, `Composed: Copy with …` y `Unknown`, que es por donde presentan las apps de
escritorio. Que `Hardware Composed: Independent Flip` contenga la palabra «Composed» es justo la razón
de comparar por prefijo y no buscar la subcadena.

La pieza que hace que esto no rompa nada es **dónde** se aplica: la calificación es un **requisito de
entrada al enganche**, no un filtro por lectura. Un proceso pasa a `calificado` la primera vez que
emite un present en modo `Hardware…`, y **lo sigue siendo mientras viva su tracker**. Así:

- Un juego que alterna de modo (DWM lo degrada al mostrarse un overlay, o al abrir un menú) no pierde
  el contador.
- Un juego que se va a segundo plano tampoco: sigue presentando y sigue calificado.
- Discord nunca entra, porque nunca emite un present `Hardware…`.

La segunda vía de calificación —ser el juego detectado— entra por el mismo sitio: el `PresentMonReader`
recibe el ejecutable del juego activo y lo trata como calificado. Es un `set` de una entrada que se
actualiza cuando cambia la detección. **Solo puede encender**, nunca apagar, así que ningún caso que
hoy funcione deja de funcionar por esta vía.

Con la calificación puesta, `fps()` no cambia de forma: sigue eligiendo entre trackers y aplicando
`MARGEN_CAMBIO`, pero **solo mira los calificados**. Si no hay ninguno, devuelve `null` y el overlay
pinta «—» — el camino que ya existe y ya está testeado.

## Archivos / módulos afectados

- `src/main/perf-metrics/presentmon.ts` — el grueso. `parseCsvHeader` pasa a localizar también
  `presentmode` (y a exigirla: sin ella no hay calificación posible). En `onLine`, marcar el tracker
  como calificado si el modo empieza por `Hardware`. En `fps()`, iterar solo sobre calificados. Método
  nuevo `setDetectedGame(exe | null)` para la segunda vía. Constante nueva con el prefijo.
- `src/main/perf-metrics/sampler.ts` — reexpone `setDetectedGame` hacia el reader (la Fase 19 quitó
  `setGameExe`; esto **no** lo revive: aquel era un requisito, este es un atajo opcional).
- `src/main/index.ts` — al cambiar el juego detectado, avisar al sampler. El evento ya existe: el
  juego viaja en `CaptureStatus` y `applyActiveGame()` (`capture/manager.ts:330`) es el punto único
  por el que pasan los cambios.
- `src/main/__tests__/perf-metrics.test.ts` — tests nuevos; la constante `CABECERA` ya incluye
  `PresentMode` en la posición 7 y el helper `fila()` ya lo escribe, así que hay que parametrizarlo
  para poder emitir filas con distintos modos.

Nada del renderer cambia: «—» para `null` ya está implementado y testeado.

## Decisiones y alternativas consideradas

- **Calificar por modo de presentación** — frente a **gatear por la detección de juegos**: gatear
  reintroduce exactamente la dependencia que el owner pidió quitar en la Fase 19 (los FPS deben
  funcionar con emuladores desconocidos). El modo de presentación es una propiedad del proceso, no de
  una lista que hay que mantener.
- **Calificación como puerta de entrada** — frente a **filtrar en cada lectura**: filtrar por lectura
  haría parpadear el contador cada vez que DWM cambia el modo (overlays de terceros, menús,
  transiciones). La puerta de entrada + enganche pegajoso da el comportamiento observable de la NVIDIA
  App: engancha cuando aparece el juego y no lo suelta.
- **La detección como segunda vía, no como requisito** — cubre el emulador en ventana normal sin poder
  apagar nada. La alternativa (solo modo de presentación) dejaba ese caso sin salida.
- **Descartado: ventana en primer plano.** Resuelve el emulador enfocado, pero al hacer alt+tab a
  Discord, Discord pasa a primer plano presentando — y vuelve exactamente el bug que la Fase 19 acaba
  de matar.
- **Descartado: ritmo de presentación sostenido.** Un juego y Discord con un vídeo reproduciéndose se
  topan los dos contra el refresco del monitor. No separa nada.
- **Descartado: un ajuste «medir también apps en ventana».** Decisión del owner, ver el spec.

## Riesgos

- **Un juego que nunca emita un present `Hardware…`** (ventana normal, o MPO desactivado en el
  driver) queda en «—» si además no está detectado. Es la limitación aceptada del spec; la salida es
  añadirlo a mano. Riesgo real pero acotado y con remedio conocido.
- **Que PresentMon reporte `Unknown` en el arranque de un juego** durante los primeros frames: no
  importa, basta un present `Hardware…` para calificar y el juego emitirá miles.
- **Cabecera sin `PresentMode`.** Si una versión futura de PresentMon renombrara la columna,
  `parseCsvHeader` devolvería `null` y **los FPS morirían del todo**, no solo la calificación. Se
  mitiga tratando la columna como opcional: sin ella se cae al comportamiento actual (todo califica),
  que es peor pero no roto. Va con test.
- **Regresión silenciosa en el enganche.** Los tests de la Fase 19 (caso Discord, re-enganche,
  segundo plano) tienen que seguir verdes sin retocarlos más que para dar modo a las filas; si alguno
  necesitara cambiar su *expectativa*, es señal de que la calificación se está aplicando en el sitio
  equivocado.

---

**Estado:** ⏳ pendiente de aprobación
