# Spec — Un fallo al lanzar un helper nativo tumba el proceso principal

**Tipo:** Fix
**Rama:** `fix/helpers-spawn-seguro`
**Fecha:** 2026-10-09

## Problema / Objetivo

Auditoría D, D5-BUG-4 (Medium, confirmado por el árbitro). Los cuatro wrappers que lanzan los helpers
nativos llaman a `child_process.spawn` sin `try/catch` y sin listener de `'error'`:

| Wrapper | Archivo | Helper |
|---|---|---|
| `realSensorsSpawn` | `src/main/perf-metrics/sensors.ts` | `gc-perf-sensors.exe` |
| `realPresentMonSpawn` | `src/main/perf-metrics/presentmon.ts` | `gc-presentmon.exe` |
| `realSpawn` | `src/main/capture/app-audio-mute.ts` | `gc-app-audio-mute.exe` |
| `realSpawn` | `src/main/capture/controller-capture.ts` | `gc-controller-listen.exe` |

Un antivirus, Smart App Control o un binario dañado pueden hacer que lanzar el helper falle, y
entonces cae el proceso principal de Electron:

- **Fallo síncrono:** `spawn` *lanza* con todo error que Node no considere «de ejecución» (lo que no
  sea EACCES/EAGAIN/EMFILE/ENFILE/ENOENT). Medido en la máquina del owner: `spawn('C:/Windows/win.ini')`
  lanza EFTYPE; medido al preparar el fix: un `.txt` da EFTYPE y un `.exe` con contenido basura da
  UNKNOWN. En el arranque, `perfSampler.configure` corre **antes** de crear la bandeja, los handlers
  IPC y la ventana: el throw aborta la inicialización entera.
- **Fallo asíncrono:** con esos cinco códigos (p. ej. ENOENT) `spawn` devuelve el hijo y emite
  `'error'` en el tick siguiente. Sin listener, es una excepción no capturada.
- **Hermano encontrado al reproducir:** `kill()` sobre un hijo que no llegó a arrancar **lanza EINVAL**
  si se llama en el mismo tick del lanzamiento (antes de que Node emita ese `'error'`). Los cuatro
  readers llaman a `kill()` al parar o al cambiar de modo, así que el fallo también podía salir por ahí.

**Causa raíz:** los wrappers asumen que `spawn` siempre devuelve un proceso vivo y que su fin llega por
`'exit'`. Ninguna de las dos cosas es cierta cuando el lanzamiento falla: o no hay proceso (throw), o su
fin llega por `'error'` y nunca por `'exit'` — así que, aun sin crash, el reader se quedaría esperando
un `exit` que no llega y no reintentaría nunca.

## Alcance

**Dentro:**
- Un helper compartido (`src/main/safe-spawn.ts`) que envuelve `spawn`: captura el throw síncrono,
  escucha siempre `'error'`, expone «el proceso terminó» como **un único aviso** (venga de `'exit'`, de
  `'error'`, de ambos o del throw) y hace de `kill()` un no-op si el proceso no llegó a arrancar. Un
  fallo se registra con un `console.warn` de una línea (helper + código), sin stack.
- Los cuatro wrappers pasan a usarlo sin cambiar su forma pública (`LineProcess`, `SpawnedProcess`), sus
  opciones de `spawn` ni su comportamiento con un proceso sano.
- Tests de regresión.

**Fuera (explícito):**
- Los readers (`SensorsReader`, `PresentMonReader`, `HapticMuteListener`, `ControllerCaptureListener`):
  no cambian. Un fallo al lanzar entra por su camino de «murió» de siempre (ver criterios).
- `realPresentMonCloseSession` (usa `spawnSync`, que devuelve el error en vez de lanzarlo, y su
  llamador ya lo envuelve en `try/catch`).
- Otros lanzamientos de la app (ffmpeg, PowerShell, `execFile` de utilidades del sistema): no son
  helpers propios y no forman parte de este bug. Los `spawn` de ffmpeg y PowerShell ya escuchan
  `'error'` y lanzan dentro de un `try/catch` o de un executor de `Promise`.
- Avisar al usuario en la UI de que un helper no arranca.

## Criterios de aceptación

- [ ] Con un helper que no es un ejecutable (throw síncrono) o que no existe (`'error'` asíncrono),
      `start()` / `configure()` / `apply()` / `stop()` no lanzan y no queda ninguna excepción sin
      capturar.
- [ ] El fin del proceso se avisa exactamente una vez por suscriptor, y en diferido cuando el fallo es
      síncrono (llega aunque el reader se suscriba después de que `spawn` devuelva).
- [ ] Sensores y PresentMon tratan el fallo como una muerte: no reintentan en caliente, reintentan a
      los 5 s (tres veces) y después cada 60 s.
- [ ] Háptico y mandos olvidan el proceso fallido y no lo relanzan solos; el siguiente `apply` (init o
      guardar ajustes) lo intenta otra vez.
- [ ] Con un proceso sano todo sigue igual: mismas opciones de `spawn` (incluido el `stdin: 'pipe'`
      contra huérfanos), mismas líneas, `exit` entregado en el propio evento y `kill()` que llega al
      proceso.
- [ ] Suite verde.
