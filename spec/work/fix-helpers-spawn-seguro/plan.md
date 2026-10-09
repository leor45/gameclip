# Plan — Un fallo al lanzar un helper nativo tumba el proceso principal

> **Este plan es un contrato.** Diseño decidido por el owner en el encargo de la tanda D.

## Enfoque

1. `src/main/safe-spawn.ts` — `safeSpawn(nombre, exePath, args, options, spawnFn = spawn)` devuelve
   `{ child, kill(), onEnd(listener) }`:
   - `try/catch` alrededor de `spawn`; si lanza, `child = null`, un `console.warn` y el fin se avisa
     con `process.nextTick` (igual que hace Node con sus propios fallos de lanzamiento).
   - Listener de `'exit'` y de `'error'` desde el primer momento. `'error'` sin `pid` (no llegó a
     arrancar) = fin; con `pid` es un `kill()` fallido de un proceso vivo: solo se registra, y el fin
     llega con su `'exit'`.
   - Un flag `terminado` deduplica: cada suscriptor recibe un aviso. Uno que se suscriba tarde lo
     recibe en diferido.
   - `kill()`: no-op sin `pid`; con `pid`, `child.kill()` como siempre.
2. Los cuatro wrappers cambian `spawn(...)` por `safeSpawn(EXE, ...)` con **las mismas opciones**, leen
   `stdout` de `proc.child` y cambian `child.on('exit')` por `proc.onEnd` y `child.kill()` por
   `proc.kill()`. Nada más.

## Archivos / módulos afectados

- `src/main/safe-spawn.ts` (nuevo)
- `src/main/perf-metrics/sensors.ts`, `src/main/perf-metrics/presentmon.ts`
- `src/main/capture/app-audio-mute.ts`, `src/main/capture/controller-capture.ts`
- Tests: `src/main/__tests__/safe-spawn.test.ts`, `src/main/__tests__/helpers-spawn-fallido.test.ts`

## Decisiones y alternativas consideradas

- **Un `'error'` con `pid` no cuenta como fin.** El diseño de partida trataba cualquier `'error'` como
  fin. Fallo concreto: el único `'error'` posible de un proceso que sí arrancó es un `kill()` fallido
  (EPERM), que Node emite **síncrono dentro de `kill()`**; en el cambio de modo de `SensorsReader`
  (`kill()` antes de soltar la referencia) eso marcaría el helper como muerto, borraría la lectura y
  retrasaría 5 s el relanzado — con el proceso viejo quizá aún vivo. Con el criterio del `pid`, el
  comportamiento ante ese error es el mismo que con un `kill()` correcto, y el fin sigue siendo único.
- **`kill()` no-op sin `pid`** y no un `try/catch` alrededor de `child.kill()`: medido que Node lanza
  EINVAL ahí; con un proceso sano `kill()` queda exactamente igual que antes.
- **`process.nextTick`** y no `setImmediate` para el aviso del throw síncrono: es lo que usa Node para
  sus propios fallos de lanzamiento, y llega antes del siguiente tick del sampler.
- **El `'exit'` sano se entrega síncrono dentro del propio evento**, como antes: diferirlo cambiaría el
  orden respecto a las últimas líneas de stdout.
- **No se cierra el readline al terminar.** En un `'exit'` sano pueden quedar líneas por leer (Node
  avisa de que stdio puede seguir abierto); en un ENOENT el stdout recibe EOF y el readline se cierra
  solo (medido: todo cerrado en 4 ms); en un throw síncrono no hay stdout.
- **Readers sin cambios.** Ninguno entra en bucle: Sensores y PresentMon reintentan por `muertoEn` con
  5 s ×3 y luego 60 s; háptico y mandos solo relanzan en el siguiente `apply` (init y guardar ajustes,
  nunca por temporizador).
- **Un `console.warn` por intento fallido**, acotado por esa misma cadencia.

## Riesgos

- Electron 29 trae Node 20.9; los tests corren en Node 22. Las piezas de Node implicadas (el throw
  síncrono fuera de los cinco códigos, el `'error'` diferido, el `pid` undefined y el EINVAL del
  `kill()`) son anteriores a ambas versiones.
- Con un throw síncrono, que Node cierre los pipes de stdio ya creados depende de su versión; si no lo
  hiciera, cada intento fallido dejaría dos pipes abiertos, acotado por la cadencia de reintentos.

---

**Estado:** ✅ aprobado el 2026-10-09
