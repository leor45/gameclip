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
- [ ] **Elevado y sin PawnIO** (servicio parado a mano para simularlo): `cpuTemp` en «—», el resto de
      métricas intactas y el helper sigue vivo emitiendo.
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

## Notas de verificación

⚠️ **La máquina del owner ya tiene PawnIO instalado** (`C:\Program Files\PawnIO`, servicio `PawnIO`
en `Running` — probablemente de FanControl o del propio LibreHardwareMonitor). Es decir: **esta
máquina no puede validar por sí sola el caso "usuario sin PawnIO"**, que es el de cualquiera que se
baje el portable. El caso ausente se simula **parando el servicio** (elevado), no asumiendo.
