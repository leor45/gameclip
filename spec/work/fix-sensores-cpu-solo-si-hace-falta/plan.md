# Plan — El grupo de CPU solo se abre si se pidió Temp CPU

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

El helper pasa de tener **un solo modo** a tener dos, y quien decide es el main a partir de las
métricas marcadas. La pieza que falta hoy es un **canal para decírselo**: `realSensorsSpawn()` lo
lanza con `[]`, así que `Program.cs` no tiene forma de saberlo y por eso pone `IsCpuEnabled = true`
siempre. Se añade un argumento `--cpu`.

Cuatro cambios encadenados:

1. **`Program.cs` lee sus argumentos.** `IsGpuEnabled` sigue fijo; `IsCpuEnabled` pasa a ser
   `args.Contains("--cpu")`. **Sin la bandera, el grupo de CPU no se abre y los MSR no se tocan** —
   que es el objetivo entero de la tarea. `Sample()` no cambia: ya hace `PickByType(…, Cpu)`, que
   devuelve `null` cuando el grupo no está abierto, y `cpuTemp` se queda en `null` como siempre.
2. **`SensorsDeps.spawn` acepta argumentos** — `(exePath, args) => LineProcess`. Es la frontera
   inyectable que ya usan los tests, así que comprobar *con qué* se lanza el helper sale gratis.
3. **`SensorsReader.start()` recibe el modo** (`start({ cpu })`) y **recuerda con cuál está
   corriendo**. Si le piden otro, para el proceso y lo relanza; si es el mismo, sigue siendo
   idempotente como hoy.
4. **`PerfSampler.configure()` lo deriva de las métricas**: `needsSensors()` decide *si* corre (sin
   cambios) y `metrics.cpuTemp` decide *en qué modo*.

Relanzar al cambiar de modo es seguro porque **`configure()` no se llama por tick**: solo al arrancar
y desde `settings:changed` (`src/main/index.ts:473` y `:539`), o sea una acción del usuario. Por eso
tampoco hay riesgo de bucle con el flag `failed`, que se resetea al cambiar de modo (un cambio de
ajustes merece un intento nuevo, igual que hoy lo merece un `stop()` + `start()`).

## Archivos / módulos afectados

- `native/gc-perf-sensors/Program.cs` — lee `--cpu`; `IsCpuEnabled` deja de ser incondicional. **El
  cambio que de verdad evita tocar ring0**; el resto es fontanería para llegar hasta aquí.
- `src/main/perf-metrics/sensors.ts` — `spawn(exePath, args)`, `start({ cpu })`, memoria del modo
  actual y relanzado al cambiar.
- `src/main/perf-metrics/sampler.ts` — `configure()` pasa `{ cpu: metrics.cpuTemp }`.
- `src/main/__tests__/perf-metrics.test.ts` — tests del modo (ver abajo).
- `spec/constitution/roadmap.md` — al entregar.

**No se toca:** `pawnio.ts` ni el aviso de Ajustes (`fix/sensores-pawnio` los dejó bien), PresentMon,
ni el catálogo de métricas.

## Decisiones y alternativas consideradas

- **Una bandera `--cpu` (opt-in) y no `--no-cpu` (opt-out).** Con opt-out, un fallo de fontanería
  —olvidar pasar el argumento, un helper viejo— dejaría el grupo de CPU abierto, que es justo lo que
  se quiere evitar: el modo por defecto debe ser **el que no toca ring0**. Que un despiste degrade a
  «no lee la temperatura» y no a «carga un driver de kernel de más».
- **Relanzar el helper al cambiar de modo**, en vez de reconfigurarlo en caliente por stdin. Sería
  más fino, pero exigiría un protocolo de entrada en un binario que hoy solo usa stdin como
  detector de EOF (para no quedar huérfano). No compensa por una acción que ocurre cuando alguien
  abre Ajustes y toca un checkbox.
- **Al relanzar por cambio de modo, se conserva la última lectura** en vez de resetear a
  `EMPTY_SENSOR_READING` como hace `stop()`. Si no, marcar/desmarcar Temp CPU haría **parpadear a
  «—» las métricas de GPU** durante el segundo que tarda el helper en dar su primera muestra. Es el
  mismo criterio con el que la Fase 19 arregló el parpadeo de los FPS: un valor de hace un segundo
  informa mejor que un guion. `stop()` de verdad (apagar el overlay) sí sigue limpiando.
- **`needsSensors()` no cambia.** Sigue lanzando el helper si hay cualquier métrica de sensores
  marcada; lo que cambia es en qué modo. Meter aquí la lógica de CPU confundiría dos preguntas
  distintas: *¿hace falta el helper?* y *¿hace falta el grupo de CPU?*

## Tests

- `start({ cpu: false })` lanza el helper **sin** `--cpu`; con `true`, **con** `--cpu`.
- Pedir el mismo modo dos veces **no** relanza (sigue siendo idempotente).
- Pedir el otro modo **sí** relanza: mata el anterior y arranca con los argumentos nuevos.
- Al relanzar por cambio de modo, `latest()` **conserva** la lectura previa (no parpadea).
- `stop()` sigue limpiando la lectura.
- `PerfSampler`: con `cpuTemp` marcada pide modo CPU; sin ella, no — aunque haya métricas de GPU.
- Sin ninguna métrica de sensores, el helper no se lanza (regresión de lo de hoy).

## Riesgos

- **Regresar `fix/sensores-pawnio`**: si la bandera no llega bien, `cpuTemp` se queda en `null` para
  todo el mundo y parecería que PawnIO no funciona. Lo cubre el criterio de aceptación de que
  elevado y con Temp CPU marcada la temperatura **sigue llegando**, verificado a mano además de en
  tests.
- **El helper se relanza más de lo previsto** si algún día `configure()` empieza a llamarse por tick.
  Hoy no ocurre (comprobado), pero un relanzado por segundo sería un proceso nuevo cada segundo. Si
  eso cambiara, el modo tendría que dejar de decidirse en `start()`.
- **No se puede verificar el efecto sobre el driver en la máquina del owner** sin parar el servicio,
  que está prohibido: PawnIO es de FanControl y gobierna sus ventiladores. La verificación mira **los
  argumentos con que se lanza el helper** y **su salida** (`cpuTemp` presente o no), que es lo que
  esta tarea controla de verdad. Que el servicio quede intacto se comprueba en lectura.

---

**Estado:** ✅ aprobado el 2026-07-18
