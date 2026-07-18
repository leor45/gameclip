# Spec — El grupo de CPU solo se abre si se pidió Temp CPU (no tocar ring0 de más)

**Tipo:** Fix
**Rama:** `fix/sensores-cpu-solo-si-hace-falta`
**Fecha:** 2026-07-18
**Release:** 0.9.0, junto a `fix/sensores-pawnio` y `fix/copy-sin-nvidia-app`

## Problema / Objetivo

Quien **no** pide la temperatura de CPU no debería provocar que se cargue un driver de anillo 0. Hoy
sí ocurre: desmarcar «Temperatura de CPU» deja de **pintar** el número, pero por debajo no cambia
nada.

**Causa raíz — tres eslabones, ninguno condicionado a la métrica:**

1. `needsSensors()` (`src/main/perf-metrics/sampler.ts:12-21`) lanza el helper si está marcada
   **cualquiera** de las seis métricas de sensores — y `gpuUsage` viene **marcada por defecto**
   (`DEFAULT_PERF_OVERLAY`), así que en la práctica el helper corre casi siempre.
2. `realSensorsSpawn()` (`src/main/perf-metrics/sensors.ts:130`) lo lanza **sin argumentos**: el
   helper no puede saber qué métricas quiere el usuario.
3. `Program.cs:34-35` pone `IsGpuEnabled = true` **y `IsCpuEnabled = true` incondicionalmente**.
   Abrir el grupo de CPU es justo lo que engancha los MSR y, con ello, PawnIO.

Resultado: un usuario que solo quiere FPS y uso de GPU, y que tenga PawnIO instalado (por FanControl,
por LibreHardwareMonitor…), hace que GameClip lo enganche igualmente.

**Por qué importa, y no es cosmético:** PawnIO arregla el flag de Defender pero **no** la fricción con
anti-cheats de kernel — quedó anotado en `fix/sensores-pawnio` como limitación aceptada. Si esa
fricción existe, hay que pagarla **solo cuando el usuario pidió la métrica que la necesita**, no por
defecto. Detectado al revisar la entrega de `fix/sensores-pawnio` (pregunta del owner).

## Alcance

**Dentro:**

- El helper abre el grupo de CPU **solo si se le pide**: un argumento (p. ej. `--cpu`) que el main
  pasa cuando `cpuTemp` está marcada.
- El arranque del helper se recalcula al cambiar los ajustes, para que marcar/desmarcar Temp CPU en
  caliente relance el helper en el modo correcto.
- Sin ninguna métrica de sensores marcada, el helper **sigue sin lanzarse** (comportamiento actual).

**Fuera (explícito):**

- **⛔ Parar, cerrar, descargar o desinstalar el servicio PawnIO. Jamás, bajo ninguna condición.**
  Ver la sección siguiente: es el malentendido que hay que evitar de raíz.
- Cualquier lógica de "¿lo está usando alguien más?" para decidir si apagarlo. No se construye:
  llevar la cuenta de los usuarios de un driver de kernel es frágil, es carrera pura (otro proceso
  puede engancharlo entre la comprobación y la acción) y **no es asunto de una app de clips**.
- Cambiar qué métricas existen o sus valores por defecto.
- Tocar PresentMon (los FPS necesitan admin, no PawnIO) ni el aviso de PawnIO de `fix/sensores-pawnio`.
- Hacer lo mismo con el grupo de GPU: NVAPI/ADL son APIs de usuario, no hay driver que ahorrar.

## ⛔ Esto NO apaga PawnIO — deja de usarlo

Distinción que decide toda la implementación, y que ya provocó un malentendido al plantear la tarea
(pregunta del owner, 2026-07-18: *«al desmarcar la temp del CPU se apaga y cierra PawnIO, ¿verdad?»*).

**No.** PawnIO es un **servicio de Windows instalado a nivel de sistema**. GameClip no lo instala, no
lo arranca y no lo para — **hoy no hay una sola línea en el repo que gestione servicios**, y esta
tarea no añade ninguna. Lo que hace LibreHardwareMonitor es **hablarle**: cargar sus módulos MSR y
leer. Cuando el helper termina, simplemente termina; el servicio queda como estaba.

Lo que cambia este fix es **si le hablamos o no**, no su ciclo de vida:

| | Hoy | Con el fix, Temp CPU desmarcada |
|---|---|---|
| El helper abre el grupo de CPU | sí, siempre | **no** |
| Se cargan módulos MSR en PawnIO | sí | **no** |
| Estado del servicio PawnIO | intacto | **intacto** |

**La regla, escrita para que no se reinterprete:** *no se gestiona un servicio que no instalaste.* En
la máquina del owner ese servicio es de **FanControl**, que gobierna los ventiladores de su PC:
pararlo es un riesgo térmico con el equipo encendido. Pero la regla no depende de eso — vale igual en
un PC donde nadie más lo use, porque el usuario lo instaló para algo y GameClip no es quién.

> Evidencia de que la separación ya se cumple hoy: durante la verificación de `fix/sensores-pawnio` el
> servicio quedó en `Running` **antes y después** de cada ejecución elevada del helper. Arrancar, leer
> y morir no le afecta.

**Pregunta abierta para el plan (no bloquea, y no cambia la dirección del fix):** si PawnIO estuviera
*parado* e instalado, ¿abrir el grupo de CPU haría que Windows lo **arrancara** por demanda? No se ha
verificado —comprobarlo exigiría parar el servicio, que está prohibido— y el fix mejora el caso en
cualquiera de las dos respuestas: si lo arrancaba, deja de hacerlo cuando nadie pidió Temp CPU. En un
PC de pruebas sin FanControl sí se puede medir.

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] Con **Temp CPU desmarcada** y alguna métrica de GPU marcada, el helper corre y **no** abre el
      grupo de CPU (`IsCpuEnabled = false`).
- [ ] Con **Temp CPU marcada**, el helper abre el grupo de CPU y `cpuTemp` sigue llegando con valor
      (elevado y con PawnIO): **no se regresa** lo que arregló `fix/sensores-pawnio`.
- [ ] Marcar/desmarcar Temp CPU con la app abierta surte efecto sin reiniciar.
- [ ] Sin ninguna métrica de sensores marcada, el helper no se lanza.
- [ ] **El servicio PawnIO sigue en el mismo estado** antes y después de marcar y desmarcar Temp CPU
      varias veces, con la app abierta. Se comprueba en **lectura** (`Get-Service PawnIO`).
- [ ] FanControl sigue gobernando los ventiladores durante y después de la prueba (en la máquina del
      owner, que es donde este criterio importa de verdad).
- [ ] Tests de la decisión (qué modo se pide según las métricas marcadas) y gates verdes.

## Notas de verificación

⚠️ **No parar el servicio PawnIO** de la máquina del owner: es de FanControl y gobierna los
ventiladores del PC (ver el spec de `fix/sensores-pawnio`). Para comprobar que el grupo de CPU no se
abre, mirar la salida del helper (`cpuTemp` ausente/null) o los argumentos con que se lanza, **no** el
estado del driver.

⚠️ Inspeccionar los módulos cargados de un proceso **elevado** desde una shell normal **no funciona** y
devuelve una lista vacía que parece una respuesta válida — pasó durante la revisión: `$p.Modules`
devolvió 1 módulo y ningún PawnIO, **sin lanzar excepción**, lo que a primera vista parecía confirmar
justo lo contrario de la realidad. Si se verifica por esa vía, hacerlo desde una shell elevada y
comprobar antes que la enumeración funciona de verdad (buscando una DLL que se sabe cargada).
