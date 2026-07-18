# Plan — Los helpers del overlay no se relanzan si mueren una vez

> **Este plan es un contrato.** Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.
> El owner delegó explícitamente la aprobación de este plan (2026-07-18).

## Enfoque

**No se inventa un mecanismo: se extiende el que ya existe.** El watchdog de PresentMon ya resuelve
«vivo pero mudo» con reintentos escalonados, y lo hace **sin timers**: se mueve desde `fps()`, que el
sampler llama cada segundo. La muerte del proceso se trata igual, con el mismo reloj y las mismas
constantes.

El cambio conceptual es sustituir un **flag terminal** por un **estado con hora**:

| Hoy | Después |
|---|---|
| `failed = true` para siempre | `muertoEn = <timestamp>` |
| `start()` sale y no vuelve | el siguiente tick relanza cuando toca |

`failed` **no desaparece**: se queda para el único caso que de verdad es permanente, **no encontrar el
binario**. Esa distinción es la que evita el bucle: un `.exe` que falta no aparece por esperar; un
proceso que murió, sí puede volver.

**Escalado**, reutilizando la política que el fichero ya justifica: los primeros `MAX_REINTENTOS`
intentos van rápidos y a partir de ahí se pasa a `REINTENTO_LENTO_MS` (60 s) **sin rendirse nunca** —
igual que el watchdog, y por el mismo motivo escrito allí: la causa suele resolverse sola.

**Sin timers, a propósito.** Los dos readers ya son consultados cada segundo por el sampler
(`fps()` y `latest()`), así que el reintento se evalúa ahí. Añadir `setInterval` metería un ciclo de
vida nuevo que apagar en `stop()` y en el cierre de la app — justo el tipo de cosa que ya causó el
bug de la bandeja destruida al cerrar (`fix/tray-destruida-al-cerrar`).

## Archivos / módulos afectados

- `src/main/perf-metrics/presentmon.ts` — `onExit` deja de marcar `failed`; nuevo estado `muertoEn` y
  reintento evaluado desde `fps()` junto al watchdog. `stop()` lo limpia.
- `src/main/perf-metrics/sensors.ts` — lo mismo, más un reloj inyectable (`now`) que hoy no tiene, y
  el reintento evaluado desde `latest()`. Relanza **con el modo actual** (`--cpu` o no), que ya se
  recuerda desde `fix/sensores-cpu-solo-si-hace-falta`.
- `src/main/__tests__/perf-metrics.test.ts` — tests de ambos.
- `spec/constitution/roadmap.md` — al entregar.

## Decisiones y alternativas consideradas

- **Mantener `failed` solo para «falta el binario»** en vez de eliminarlo. Es la única causa que no
  mejora esperando, y conservarla preserva el comportamiento probado de «sin binario no se insiste».
- **Reintento desde el tick existente, no con `setInterval`.** Menos estado que apagar, y encaja con
  cómo ya funciona el watchdog. El precio es que el reintento solo corre mientras el sampler corre —
  que es exactamente cuando interesa: si el overlay está apagado, no hay nada que recuperar.
- **La lectura se limpia al morir** (el helper de sensores ya lo hace). Durante la ventana de
  reintento se muestra «—» y no las últimas cifras: un valor de hace un minuto **presentado como
  actual** es peor que un guion, porque el usuario no puede distinguirlo. *(Es el caso contrario al
  relanzado por cambio de modo de `fix/sensores-cpu-solo-si-hace-falta`, donde el hueco es de ~1 s y
  el dato sigue siendo esencialmente válido.)*
- **Escalar a cadencia lenta en vez de un tope de intentos.** Un tope volvería a dejar las métricas
  muertas en silencio, que es justo el bug. El propio watchdog ya rechazó esa opción por escrito.
- **No avisar en la UI** (fuera de alcance): el objetivo es que se recupere solo. Un aviso para algo
  que se arregla en segundos sería ruido; si más adelante se quiere, va con su propio spec.

## Tests

- Sensores: muere → **no** se relanza en el mismo tick; pasado el tiempo, **sí**.
- Sensores: al relanzar conserva el **modo** (`--cpu` si estaba pidiéndose).
- Sensores: la lectura queda vacía mientras está muerto.
- Sensores: sin binario **no** se reintenta (sigue siendo permanente).
- PresentMon: muere → vuelve solo pasado el tiempo.
- PresentMon: los reintentos escalan a cadencia lenta.
- PresentMon: el watchdog de «vivo pero mudo» sigue funcionando (tests existentes verdes).

## Riesgos

- **Bucle de arranques** si el reintento fuese inmediato o si `failed` desapareciera del todo. Lo
  cubren las dos decisiones de arriba (espaciado obligatorio + `failed` para el binario ausente) y un
  test de que dos ticks seguidos no relanzan dos veces.
- **Romper el watchdog existente** al tocar el mismo fichero: sus tests son la red, y el reintento por
  muerte se añade como camino aparte en vez de reescribir el que ya funciona.
- **Un helper que muere al instante y siempre** (p. ej. falta .NET Framework) haría un intento cada
  60 s indefinidamente. Es el mismo coste que ya se acepta hoy para el caso «mudo», y a cambio se
  recupera solo el caso transitorio. Queda anotado, no se optimiza.

---

**Estado:** ✅ aprobado el 2026-07-18 (aprobación delegada por el owner)
