# Tasks — Con un DualSense conectado, un segundo DualSense no se detecta

## Test de regresión (primero, en rojo)

No hay arnés de C++ en la suite (el helper nativo no entra en `npm run test`). La regresión se hizo con
una simulación en tiempo virtual, fuera del repo: compila el `main.cpp` **real** (`runHidLoop`,
`rescan`, `openDualSense`, `createPressed`) con las llamadas Win32/HID/SetupAPI redirigidas por macro a
un mundo falso (mandos que aparecen y desaparecen, lecturas solapadas que completan cada N ms, reloj
virtual que avanza la espera). El falso comprueba invariantes: cada handle de la espera es de un mando
abierto con lectura armada, `GetOverlappedResult` solo se llama sobre una lectura completada y con su
`OVERLAPPED`, nunca hay dos handles al mismo DualSense ni dobles `CloseHandle`.

- [x] Rojo con el original: A abierto a 250 Hz y B conectado en t=3 s → 1 re-escaneo en 12 s, B
      nunca se abre, 2 de 4 pulsaciones emiten `capture` (solo las de A).
- [x] Verde con el arreglo: re-escaneo cada ~2 s, B se abre en t≈4 s, 4 de 4 `capture`.
- [x] Casos borde, todos con 0 invariantes violados:
  - [x] Re-escaneo lento (64 ms, el peor caso medido): 4/4.
  - [x] Sin mandos (reposo): el ritmo de re-escaneo es idéntico al original (2001 ms en la simulación).
  - [x] Un mando se desconecta y vuelve (path nuevo) con otro abierto: el original no lo reabre; el
        arreglo sí, y su pulsación emite `capture`.
  - [x] Reports escasos (cada 1,5 s): intervalo entre re-escaneos de 2,5–3 s (cota < 4 s); el
        original no abre el segundo mando.
  - [x] Tres mandos (dos al arrancar, el tercero después): 3/3.
  - [x] DualSense que no se deja abrir (en exclusiva de otra app) con otro abierto: reintento acotado
        a 2 `CreateFileW` por re-escaneo.
- [x] Sensibilidad del arnés: un mutante con el re-escaneo entre la espera y el procesado (y
      `rescan()` insertando al principio de `open`) dispara «lectura no completada / índice
      equivocado»; el arreglo con esa misma inserción al principio sigue verde (seguro por
      construcción).

## Implementación

- [x] 1. `kRescanIntervalMs = 2000` como intervalo de re-escaneo y timeout de la espera.
- [x] 2. `lastRescan` (`GetTickCount64()`) y re-escaneo por tiempo transcurrido al principio de cada
      vuelta, antes de montar `waits`.
- [x] 3. La rama de `WAIT_TIMEOUT` re-escanea como antes y actualiza `lastRescan`.

## Verificación (gates)

- [x] Compila con el g++ de WinLibs (14.2.0) y los flags de `scripts/build-controller-listen.ps1`, a un
      `.exe` temporal (sin tocar `resources/`). Con `-Wall -Wextra`: el mismo único warning que el
      original (`-Wcast-function-type` en `startGameInput`), 0 nuevos; también idénticos con
      `-Wconversion -Wsign-conversion -Wshadow`.
- [x] Humo del binario real (temporal): sigue vivo, ~15 ms de CPU en 6,5 s (igual que el original),
      sale en ~9 ms al cerrar stdin, código 0 y sin salida espuria.
- [x] Medido `rescan()` real en la máquina de desarrollo (23 interfaces HID): ~0,44 ms típico, ~64 ms
      en frío; buffer de input del driver HID: 32 reports por handle (medido).
- [x] Type-check verde · Lint verde · Tests verdes (1056/1056); no cubren C++ y no hay cambios en TS.
- [ ] Prueba real con dos DualSense conectados (no hay hardware en la máquina de desarrollo).

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
