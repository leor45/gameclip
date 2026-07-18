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

- [x] 1. `scripts/build-perf-sensors.ps1`: LHM 0.9.4 → **0.9.6** con las rutas del layout nuevo
      (`ref\net472\` para compilar, `runtimes\win-x64\lib\net472\` para enviar).
- [x] 2. Descargar el cierre de dependencias a `resources/` con versiones fijadas (**10**, no 13 —
      ver el hallazgo de abajo).
- [x] 3. `native/gc-perf-sensors/App.config` con los binding redirects; copiarlo a
      `resources/gc-perf-sensors.exe.config`. **Sin él el `.exe` compila pero no arranca.**
- [x] 4. `/platform:x64` en vez de `anycpu` (la implementación de la 0.9.6 es específica de arquitectura).
- [x] 5. `electron-builder.yml`: entrada de carpeta con filtro para el `.exe`, su `.config` y las DLLs.
- [x] 6. `src/main/perf-metrics/pawnio.ts`: `isPawnIoInstalled(baseDir)` + la URL oficial en una
      constante única (en `@shared/perf`, que la pinta el renderer) + override por `GAMECLIP_PAWNIO_DIR`.
- [x] 7. Canal `perf:pawnio-installed` (main → preload → renderer). El enlace **no** necesitó canal:
      se reusa `window.open` → `setWindowOpenHandler` → `shell.openExternal`, que ya existía.
- [x] 8. `Avanzado.tsx`: leyenda al día (Temp CPU necesita admin **y** PawnIO; FPS solo admin) y aviso
      con enlace cuando falte, **solo si Temp CPU está marcada**.
- [x] 9. Comentario de cabecera de `Program.cs` (nombra WinRing0, pasa a PawnIO). Sin cambios de código.
- [x] 10. `build/TERCEROS.txt` con las licencias nuevas, comprobadas una a una en sus `.nuspec`
      (MPL-2.0 · MIT · Apache-2.0, todas compatibles con la GPL-3.0).

> ⚠️ **Hallazgo durante la implementación — se envían 10 dependencias, no 12.** La comprobación
> anti-WinRing0 que el propio script añade **rechazó el primer build**: `RAMSPDToolkit-NDD.dll`
> contiene las cadenas `WinRing0` e `IWinRing0Driver`. Inspeccionado: **no es el driver embebido**
> (no hay `.sys` ni recurso `.gz`, solo una interfaz para hablar con un WinRing0 que ya exista — muy
> distinto del `LibreHardwareMonitor.Resources.WinRing0.gz` de la 0.9.4). Se excluye igualmente,
> junto a `DiskInfoToolkit`: las dos sirven a **grupos que el helper nunca habilita** (`Program.cs`
> pone `IsGpuEnabled` e `IsCpuEnabled` y nada más), así que son peso muerto, y enviarlas ensuciaría
> una comprobación que vale justo por ser tonta y sin matices. **Revierte la decisión del plan de
> "enviar el cierre completo"**, con la evidencia por delante.

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

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — **846** (832 de partida, +14)
- [x] El script de build termina OK y `resources/` **no contiene la cadena `WinRing0`**. La
      comprobación va **dentro del script**, así que el build falla solo si vuelve a colarse.
- [x] Helper **sin elevar**: `{"gpuUsage":13,"gpuTemp":39,"vramUsedMb":1475,…,"cpuTemp":null}`, sin
      excepciones de carga de ensamblados.
- [x] Helper **elevado**, sobre el artefacto final: `cpuTemp` **62,875 / 62,875 / 61,25 °C** (subió
      desde los 47,9 °C del paso 0 porque el portable estaba compilando — la lectura responde de
      verdad). Servicio PawnIO en `Running` antes y después: **intacto**.
- [x] Detección contra el disco real de la máquina: por defecto ve `C:\Program Files\PawnIO` → `true`;
      con `GAMECLIP_PAWNIO_DIR` a una carpeta vacía → `false`. **Sin tocar el servicio.**
- [x] Aviso "sin PawnIO" **en la app real** (dev + CDP, `GAMECLIP_PAWNIO_DIR` a carpeta vacía):
      `isPawnIoInstalled()` en vivo devuelve `false` por toda la cadena renderer → preload → IPC →
      main, el aviso aparece en el DOM con su texto y el enlace apunta a `https://pawnio.eu/`.
- [x] **Sobre el portable construido** (`GameClip-0.8.1-portable.exe`, 95 MB): el `.config` y las 10
      DLLs viajan dentro, el helper **arranca desde el empaquetado** y emite sensores, y ningún
      `.exe`/`.dll` del paquete contiene `WinRing0`.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado (desbloquea el release del overlay)
