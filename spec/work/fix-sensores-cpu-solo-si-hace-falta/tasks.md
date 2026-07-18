# Tasks — El grupo de CPU solo se abre si se pidió Temp CPU

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Test de regresión primero (rojo → verde)

Es un Fix: el test que reproduce el fallo va **antes** que el arreglo.

- [x] R1. Con `cpuTemp` **desmarcada** y una métrica de GPU marcada, el helper se lanza **sin**
      `--cpu`. Hoy falla: se lanza con `[]` y `Program.cs` abre el grupo de CPU igualmente.
      *(Rojo confirmado antes de tocar nada: 3 tests fallando.)*

## Implementación

- [x] 1. `native/gc-perf-sensors/Program.cs`: `IsCpuEnabled` pasa a depender de `--cpu`. `IsGpuEnabled`
      sigue fijo. **Es el cambio que de verdad evita tocar los MSR.**
- [x] 2. `sensors.ts`: `SensorsDeps.spawn` pasa a `(exePath, args)`; `realSensorsSpawn` los reenvía.
- [x] 3. `sensors.ts`: `SensorsReader.start({ cpu })` recuerda el modo actual, es idempotente con el
      mismo modo y **relanza** con otro.
- [x] 4. `sensors.ts`: al relanzar por cambio de modo, **conservar** la última lectura (sin parpadeo);
      `stop()` sigue limpiando.
- [x] 5. `sampler.ts`: `configure()` pasa `{ cpu: metrics.cpuTemp }`. `needsSensors()` no cambia.

## Tests unitarios (obligatorios)

Camino feliz **y** casos borde.

- [x] `start({cpu:false})` lanza sin `--cpu`; `start({cpu:true})`, con `--cpu`.
- [x] Mismo modo dos veces → **no** relanza (sigue idempotente).
- [x] Modo distinto → relanza: mata el anterior y arranca con los argumentos nuevos.
- [x] Al relanzar por cambio de modo, `latest()` **conserva** la lectura previa.
- [x] `stop()` sigue limpiando la lectura.
- [x] `PerfSampler`: con `cpuTemp` marcada pide modo CPU; sin ella no, **aunque** haya métricas de GPU.
- [x] Sin ninguna métrica de sensores, el helper no se lanza (regresión de hoy).

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — **854** (846 de partida, +8)
- [x] **La prueba que discrimina, con las dos variantes ELEVADAS** — así la diferencia es la bandera y
      no los permisos:
      - sin `--cpu` → `cpuTemp: null`, con las métricas de GPU intactas (`gpuFan` llegó a 908 RPM);
      - con `--cpu` → `cpuTemp: 48.125 °C`.
      **No se regresa `fix/sensores-pawnio`**, que era el riesgo principal.
- [x] El servicio PawnIO en `Running` **antes y después** (comprobado en **lectura**;
      ⛔ nunca pararlo: es de FanControl y gobierna los ventiladores del owner).

> Pitfall recogido: `ProcessStartInfo.ArgumentList` **no existe** en .NET Framework, así que en
> PowerShell 5.1 los argumentos van como una sola cadena en `.Arguments`. El primer intento de la
> verificación murió por esto y, al correr elevado en otra ventana, se veía solo como "sin resultado"
> — fácil de confundir con un UAC cancelado.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado (2 de 3 de la release 0.9.0)
