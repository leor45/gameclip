# Spec — Los helpers del overlay no se relanzan si mueren una vez

**Tipo:** Fix
**Rama:** `fix/helpers-no-reintentan-tras-morir`
**Fecha:** 2026-07-18
**Release:** 0.9.0 (entra antes de publicar el overlay: aún no se ha lanzado y se puede corregir a tiempo)

## Problema / Objetivo

Si un helper del overlay muere por su cuenta, **sus métricas quedan muertas en silencio el resto de
la sesión**. No hay aviso ni reintento: el usuario ve «—» para siempre y no tiene forma de saber por
qué. Solo revive desmarcando y volviendo a marcar la métrica (eso hace `stop()`+`start()`) o
reiniciando GameClip.

**Causa raíz — el mismo patrón en los dos helpers, un flag `failed` que nunca se levanta:**

| | Dónde | Qué pasa |
|---|---|---|
| PresentMon | `presentmon.ts:232` y `:258` | `onExit` pone `failed = true`; `start()` sale antes de nada si `failed`. |
| Sensores | `sensors.ts` (`onExit`) | Idéntico: `failed = true` y `start()` no vuelve a lanzarlo. |

**Lo que hace el fallo especialmente raro es que la solución ya existe al lado.** El watchdog de
PresentMon cubre el caso hermano —*vivo pero mudo*— con 3 reintentos rápidos y luego **cadencia lenta
de 60 s sin rendirse nunca**, y el porqué está escrito en el propio código (`presentmon.ts:41-44`):

> *la causa habitual (cupos ETW ocupados por sesiones huérfanas o por otro capturador) se resuelve
> sola al cerrarse el otro programa, y sin reintento lento los FPS quedarían muertos hasta reiniciar
> GameClip*

Ese argumento vale **exactamente igual** para «murió una vez», que ni siquiera se intenta. La
asimetría es absurda: *mudo* se reintenta para siempre; *muerto* —un fallo más claro— no se reintenta
nunca.

**Alcance real, mayor que el anotado en el roadmap:** la nota original hablaba solo de PresentMon.
Al revisarla se vio que `SensorsReader` tiene el patrón **idéntico**, y ahí el daño es peor: PresentMon
solo mata los FPS, mientras que el helper de sensores se lleva **siete métricas de golpe** (uso, temp,
fans y voltaje de GPU, VRAM y temperatura de CPU).

## Alcance

**Dentro:**

- Los dos helpers **se relanzan solos** tras una muerte inesperada, con reintentos espaciados y sin
  rendirse del todo, siguiendo el criterio que el watchdog de PresentMon ya aplica.
- Se conserva la protección contra bucles de arranque: no se reintenta en caliente sin pausa.
- Un aviso en el log al reintentar, para que el fallo deje de ser silencioso al diagnosticar.

**Fuera (explícito):**

- **Avisar al usuario en la UI** de que un helper se cayó. Sería otra decisión de producto (dónde,
  con qué copy, sin alarmar por algo que se recupera solo); aquí basta con que se recupere.
- Cambiar el watchdog de «vivo pero mudo», que ya funciona.
- Reintentar cuando **falta el binario** (`helperPath()` → null): eso no se arregla solo esperando y
  seguirá siendo un fallo permanente, como hoy.
- El resto de procesos de la app (obs64, los helpers de mando y de audio háptico).

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] Si el helper de sensores muere, **vuelve solo** y las métricas de hardware se recuperan sin
      tocar ajustes ni reiniciar la app.
- [ ] Si PresentMon muere, **vuelve solo** y los FPS se recuperan igual.
- [ ] Los reintentos van **espaciados** y escalan a cadencia lenta: matar el helper repetidamente no
      encadena arranques sin pausa.
- [ ] **Sin binario, no se reintenta** (sigue siendo fallo permanente).
- [ ] El watchdog de «vivo pero mudo» **sigue funcionando** igual (sus tests siguen verdes).
- [ ] Verificado **en la app real**: matar el proceso a mano y ver que reaparece con otro PID y que
      las métricas vuelven.
- [ ] Gates verdes: type-check · lint · tests.

## Notas de verificación

Este fix se puede probar E2E de verdad y sin riesgo: basta **matar el helper a mano** con la app
abierta y comprobar que reaparece. No hace falta tocar nada del sistema.

⛔ Recordatorio: **no parar el servicio PawnIO** (es de FanControl y gobierna los ventiladores del
owner). Matar `gc-perf-sensors.exe` —que es un proceso **nuestro**— no tiene nada que ver con eso y es
seguro.
