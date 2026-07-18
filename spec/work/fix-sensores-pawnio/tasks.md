# Tasks — Sensores sin WinRing0: LibreHardwareMonitor 0.9.4 → 0.9.6 (PawnIO)

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Paso 0 — La comprobación que decide (antes de escribir nada)

Si `cpuTemp` no vuelve elevado con la 0.9.6, el enfoque no vale y el plan se replantea en vez de
seguir adelante. **No se escribe código hasta tener este dato.**

- [x] 0. Ejecutar el helper ya compilado contra 0.9.6 **elevado** y comprobar que `cpuTemp` trae un
      valor plausible. Solo lectura de sensores — **sin tocar el servicio PawnIO** (es de FanControl).

> ✅ **Superado (2026-07-18).** `cpuTemp` = **47,875 / 48,125 / 47,5 °C** (7800X3D en reposo), tres
> muestras seguidas. El servicio PawnIO quedó en `Running`, sin tocar. De paso: `gpuFan` subió a
> **878 RPM** en la tercera muestra (funciona; los ceros previos eran ventiladores parados) y
> `gpuVoltage` sigue `null` **incluso elevado** → confirmado que es la NVAPI de la tarjeta y no los
> permisos. **El enfoque vale: se sigue adelante.**

## Implementación

- [ ] 1. `scripts/build-perf-sensors.ps1`: LHM 0.9.4 → **0.9.6** con las rutas del layout nuevo
      (`ref\net472\` para compilar, `runtimes\win-x64\lib\net472\` para enviar).
- [ ] 2. Descargar el cierre de dependencias a `resources/` con versiones fijadas (13 DLLs).
- [ ] 3. `native/gc-perf-sensors/App.config` con los binding redirects; copiarlo a
      `resources/gc-perf-sensors.exe.config`. **Sin él el `.exe` compila pero no arranca.**
- [ ] 4. `/platform:x64` en vez de `anycpu` (la implementación de la 0.9.6 es específica de arquitectura).
- [ ] 5. `electron-builder.yml`: entrada de carpeta con filtro para el `.exe`, su `.config` y las DLLs.
- [ ] 6. `src/main/perf-metrics/pawnio.ts`: `isPawnIoInstalled(baseDir)` + la URL oficial en una
      constante única + override por `GAMECLIP_PAWNIO_DIR`.
- [ ] 7. Canal `perf:pawnio-installed` (main → preload → renderer).
- [ ] 8. `Avanzado.tsx`: leyenda al día (Temp CPU necesita admin **y** PawnIO; FPS solo admin) y aviso
      con enlace cuando falte, **solo si Temp CPU está marcada**.
- [ ] 9. Comentario de cabecera de `Program.cs` (nombra WinRing0, pasa a PawnIO). Sin cambios de código.
- [ ] 10. `build/TERCEROS.txt` con las licencias nuevas, comprobadas una a una.

## Tests unitarios (obligatorios)

Camino feliz **y** casos borde. Al ser un Fix, la regresión va primero (rojo → verde).

- [ ] `isPawnIoInstalled` — carpeta inexistente → `false`; con `PawnIOLib.dll` → `true`.
- [ ] `isPawnIoInstalled` — carpeta que existe pero **sin** la DLL → `false` (instalación a medias).
- [ ] `GAMECLIP_PAWNIO_DIR` sobreescribe la carpeta base.
- [ ] La URL de descarga es la oficial `https://pawnio.eu` (blinda contra que se cuele un mirror).
- [ ] Renderer: sin PawnIO **y** con Temp CPU marcada → aviso + enlace visibles.
- [ ] Renderer: sin PawnIO y con Temp CPU **desmarcada** → **no** hay aviso.
- [ ] Renderer: con PawnIO → **no** hay aviso.
- [ ] Renderer: la leyenda distingue los dos requisitos (FPS admin · Temp CPU admin + PawnIO).
- [ ] Regresión: sin sensor de CPU, el resto de métricas sobrevive (la degradación como contrato).

## Verificación (gates)

- [ ] Type-check verde (`npm run typecheck`)
- [ ] Lint verde (`npm run lint`)
- [ ] Tests verdes (`npm run test`) — 832 de partida
- [ ] `npm run build:perf-sensors` termina OK y `resources/` **no contiene la cadena `WinRing0`**.
- [ ] Helper **sin elevar**: emite sensores de GPU reales y `cpuTemp` en `null`, sin excepciones de
      carga de ensamblados.
- [ ] Helper **elevado**: `cpuTemp` con valor (es el paso 0, se re-confirma sobre el build final).
- [ ] Aviso "sin PawnIO" visto en la app real vía `GAMECLIP_PAWNIO_DIR` a una carpeta vacía —
      **nunca parando el servicio**. El enlace abre `pawnio.eu` en el navegador del sistema.
- [ ] **Sobre el portable construido** (`npm run build:portable`, no dev): el helper arranca y emite.
      Es el único sitio donde se ve si faltó el `.config` o una DLL en `extraResources`.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado (desbloquea el release del overlay)
