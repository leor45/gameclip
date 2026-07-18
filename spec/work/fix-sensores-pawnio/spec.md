# Spec — Sensores sin WinRing0: LibreHardwareMonitor 0.9.4 → 0.9.6 (PawnIO)

**Tipo:** Fix
**Rama:** `fix/sensores-pawnio`
**Fecha:** 2026-07-18

## Problema / Objetivo

El overlay de rendimiento (Fase 19, en `main` **sin publicar**) lee GPU y temperatura de CPU con el
helper `gc-perf-sensors.exe`, que `scripts/build-perf-sensors.ps1` compila contra
**LibreHardwareMonitorLib 0.9.4** (nov-2024). Esa versión **embebe el driver ring0 WinRing0**, y
desde **septiembre de 2025 Windows Defender lo marca** como `VulnerableDriver:WinNT/Winring0.G` y
`HackTool:Win32/Winring0`, poniendo en cuarentena a las apps que lo cargan.

**Causa raíz — verificada sobre el binario que hoy enviamos, no sobre las notas del release:** las
cadenas embebidas en la DLL cacheada en `build/perf-sensors-sdk/librehardwaremonitorlib.0.9.4/` son

```
LibreHardwareMonitor.Resources.WinRing0.gz
LibreHardwareMonitor.Resources.WinRing0x64.gz
```

En la **0.9.6** (feb-2026) no hay **ninguna** ocurrencia de `WinRing0`: en su lugar embebe los
módulos de **PawnIO** (`LibreHardwareMonitor.Resources.PawnIo.*.bin` — `IntelMSR`, `AMDFamily17`,
`RyzenSMU`, `LpcIO`…). LibreHardwareMonitor hizo el cambio el 16-sep-2025 (PR #1857) y FanControl lo
adoptó en su v238; con eso se le acabaron los reportes de antivirus.

Este es justo el release que **estrena** las métricas de hardware. Publicarlo con WinRing0 es pisar
la mina a propósito: para un portable que se descarga de GitHub, que Defender lo marque como
*HackTool* es un problema de adopción, no una molestia. **El overlay no se publica hasta resolverlo.**

## Alcance

**Dentro:**

- Subir LibreHardwareMonitorLib de **0.9.4 a 0.9.6** en `scripts/build-perf-sensors.ps1`, con lo que
  ese salto arrastra (ver plan: el paquete cambió de layout y de dependencias, y el helper deja de
  enlazar en cuanto se toca la versión).
- Que el helper **siga compilando con el `csc` de Windows** (sin SDK de .NET) y **siga entregando los
  mismos sensores** que hoy: uso/temp/fan/voltaje de GPU, VRAM y temperatura de CPU.
- **Degradación limpia sin PawnIO instalado:** el resto de métricas sigue vivo y solo Temp CPU cae a
  «—»; el helper no se cae ni deja de emitir.
- **Copy al día:** hoy la UI dice que Temp CPU necesita administrador; con PawnIO necesita
  administrador **y** PawnIO. La leyenda de Ajustes → Avanzado tiene que decir la verdad.
- **Aviso con enlace a la descarga de PawnIO** cuando falte: detectar si está instalado y, si no,
  mostrarlo en Ajustes → Avanzado junto a la métrica, con un enlace que abre **la página oficial**
  (`https://pawnio.eu`) en el navegador del sistema.
- Aviso de licencias/terceros (`build/TERCEROS.txt`) al día con las dependencias nuevas.

**Fuera (explícito):**

- **Descargar o ejecutar el instalador de PawnIO desde la app**, y **empaquetarlo** dentro del
  portable. La app **avisa y enlaza**; instalar un driver de kernel lo decide y lo hace el usuario,
  en la web oficial. La diferencia no es de tamaño sino de superficie: descargar implica red desde el
  main, verificar lo descargado, UAC y un binario de terceros dentro del portable. Va en su propio
  spec si el owner lo quiere.
- **Comprobar la versión** de PawnIO instalada, o avisar de actualizaciones suyas: solo está o no está.
- Arreglar la fricción con **anti-cheats**: PawnIO sigue siendo ring0 (bytecode sandboxeado) y
  FanControl documenta su v238 como incompatible con **FACEIT**. La recomendación al usuario sigue
  siendo no elevar si juega algo con anti-cheat de kernel.
- Métricas nuevas (disco, RAM SPD, ventiladores de placa) aunque la 0.9.6 traiga librerías para ello.
- `feature/overlay-proteccion-selectiva` y `fix/presentmon-no-reintenta-tras-morir`: sus propias ramas.
- Cambiar la versión de **PresentMon** (2.5.1 se queda como está).
- **Notas del release:** decisión del owner (2026-07-18) — esto **no** va en las notas, solo en los
  commits. El overlay nunca se publicó, así que ningún usuario recibió jamás WinRing0: no hay nada
  que comunicar ni de qué advertir. Es un arreglo interno previo al estreno.

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] `scripts/build-perf-sensors.ps1` compila el helper contra **0.9.6** y termina OK en una máquina
      **sin SDK de .NET** (solo el `csc` de `%WINDIR%\Microsoft.NET\Framework64`).
- [ ] El `.exe` y las DLLs que quedan en `resources/` **no contienen la cadena `WinRing0`** — el
      criterio se comprueba con una búsqueda de cadenas, no leyendo el changelog.
- [ ] **Sin elevar:** el helper arranca y emite su línea JSON por segundo con los sensores de GPU
      (uso, temp, VRAM) con valores reales; `cpuTemp` en `null`. Ni una excepción de carga de
      ensamblados.
- [ ] **Elevado y con PawnIO instalado:** `cpuTemp` trae un valor plausible — la métrica **no se
      pierde** con el cambio. *(Es el criterio que decide si el upgrade vale: cambiar el flag de
      Defender por una métrica muerta no es un arreglo.)*
- [ ] **Sin PawnIO** (simulado apuntando la detección a una carpeta vacía — **nunca** parando el
      servicio, ver abajo): `cpuTemp` en «—», el resto de métricas intactas y el helper sigue vivo
      emitiendo.
- [ ] La leyenda de Ajustes → Avanzado menciona PawnIO junto al requisito de administrador, con test.
- [ ] **Con PawnIO ausente y Temp CPU marcada**, Ajustes → Avanzado muestra el aviso con el enlace de
      descarga; el enlace apunta a `https://pawnio.eu` (**la oficial**, nunca un mirror) y abre en el
      navegador del sistema, no dentro de la app. Con PawnIO instalado, el aviso **no** aparece.
- [ ] El aviso explica **qué** es PawnIO y **para qué** hace falta, sin prometer que la app lo
      instale y sin empujar a instalarlo: es un driver de kernel y 8 de las 9 métricas van sin él.
- [ ] **Sobre el portable ya construido** (`npm run build:portable`, no en dev): el helper arranca y
      emite sensores. El usuario final **no instala ni configura nada** para esto — el `.exe`, sus
      DLLs y el `.config` de binding redirects viajan dentro del paquete. *(Criterio propio porque el
      fallo de empaquetado es invisible en dev y tumba el helper entero, no solo Temp CPU.)*
- [ ] Gates verdes: type-check · lint · tests (832 hoy).

## Qué métrica depende de qué (la base de la copy)

Verificado contra el código (`PERF_METRIC_KEYS` en `src/shared/perf.ts`, el reparto de fuentes en
`sampler.ts:97-117`) y contra una ejecución real del helper sin elevar.

| Métrica | Fuente | ¿Admin? | ¿PawnIO? |
|---|---|---|---|
| CPU (uso) | `os.cpus()` (Node) | no | no |
| RAM | `os.totalmem/freemem` (Node) | no | no |
| GPU (uso) | helper LHM → NVAPI/ADL | no | no |
| Temp GPU | helper LHM → NVAPI/ADL | no | no |
| Fans GPU | helper LHM → NVAPI/ADL | no | no |
| Voltaje GPU | helper LHM → NVAPI/ADL | no | no |
| VRAM | helper LHM → NVAPI/ADL | no | no |
| FPS | PresentMon (ETW) | **sí** | no |
| **Temp CPU** | helper LHM → **MSR (ring0)** | **sí** | **sí** |

**PawnIO lo necesita una sola métrica: Temp CPU** — la temperatura del procesador se lee de los
*Model Specific Registers*, que exigen anillo 0 (es lo que hacen los módulos `IntelMSR`,
`AMDFamily17` y `RyzenSMU` que la 0.9.6 embebe). Todo lo de GPU va por las APIs del fabricante
(NVAPI/ADL), de usuario y sin driver. Confirmado sin elevar: GPU 19 %, Temp GPU 38 °C,
VRAM 1421/12282 MB reales y `cpuTemp` en `null`.

**Son dos requisitos distintos y la copy no debe fundirlos:** FPS necesita **administrador pero no
PawnIO**; Temp CPU necesita **las dos cosas**. Es la única que las necesita.

> Observación previa y **fuera de alcance**: en la máquina del owner (RTX 4070 Ti) `gpuVoltage`
> también vuelve `null` con el resto de sensores vivos — muchas tarjetas de consumo no exponen el
> voltaje del core por NVAPI. No lo causa este cambio ni lo arregla PawnIO.

## Notas de verificación

### ⛔ El servicio PawnIO de esta máquina NO SE TOCA

`C:\Program Files\PawnIO` y el servicio `PawnIO` en `Running` **son de FanControl**, con el que el
owner **controla la velocidad y el arranque de los ventiladores de su PC**. Pararlo, desinstalarlo o
cambiarle el tipo de arranque puede dejar los ventiladores en el comportamiento por defecto de la
placa **con el equipo en marcha**: es un problema térmico real, no una molestia de pruebas.

**Prohibido en esta tarea:** `Stop-Service PawnIO`, `sc stop/delete`, el desinstalador de PawnIO o
cualquier cosa que altere su estado. Consultarlo en modo lectura (`Get-Service`) sí.

**Cómo se simula el caso "no instalado", entonces:** la detección es una función pura con la carpeta
base **inyectada** (`isPawnIoInstalled(baseDir)`), así que basta con apuntarla a una carpeta vacía.
Tres niveles, ninguno toca el servicio:

1. **Tests unitarios** — `baseDir` inexistente → `false`; con un `PawnIOLib.dll` de mentira en un
   directorio temporal → `true`.
2. **Test de renderer** — el canal devuelve `false` → el aviso y su enlace aparecen; devuelve `true`
   → no aparecen.
3. **E2E en la app real** — variable de entorno `GAMECLIP_PAWNIO_DIR` que sobreescribe la carpeta
   base; apuntándola a una carpeta vacía, la app se comporta como en un PC sin PawnIO y se ve el
   aviso de verdad, con PawnIO intacto y FanControl funcionando.

**Esto es mejor prueba que parar el servicio**, además de más segura: lo que hay que verificar es que
la alerta sale y enlaza bien, y la ruta de detección es exactamente la misma que en un PC limpio.

⚠️ Sigue en pie que **esta máquina no ve el aviso sola** (aquí PawnIO está y seguirá estando), así
que el caso hay que forzarlo a propósito — no darlo por visto.
