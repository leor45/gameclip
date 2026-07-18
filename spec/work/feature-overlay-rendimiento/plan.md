# Plan — Overlay de rendimiento configurable

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Cinco piezas: ajustes → ventana overlay → muestreo de métricas → distribución de helpers →
integración (avisos, hotkey, auto-inicio elevado).

### 1. Ajustes (`perfOverlay` en `CaptureSettings`)

Un objeto anidado nuevo (a diferencia de los campos planos existentes, son ~15 campos que viajan
juntos):

```ts
interface PerfOverlaySettings {
  enabled: boolean;
  toggleHotkey: string;                 // acelerador Electron; default 'Alt+R'
  metrics: {
    fps; gpuUsage; gpuTemp; gpuFan; gpuVoltage; vram;
    cpuUsage; cpuTemp; ram;             // todos boolean
  };
  posX: number;                         // 0–100 (slider horizontal)
  posY: number;                         // 0–100 (slider vertical)
  layout: 'horizontal' | 'vertical';    // lineal | desglosado
  textColor: string;                    // hex #RRGGBB
  bgOpacity: number;                    // 0–100
}
```

**Posición estilo NVIDIA App:** la fuente de verdad son los sliders `posX`/`posY`. El preset es
**derivado**: bandas 0–33 / 34–66 / 67–100 por eje dan la etiqueta ("Parte superior central",
"Parte central derecha"…). La combinación banda-central × banda-central no existe: si `posY` cae
en la banda central, `posX` se ajusta a la izquierda o derecha más cercana (nunca centro de
pantalla, como NVIDIA). Elegir un preset con las flechas fija los sliders a valores canónicos
(0 / 50 / 100). Helper puro `presetFor(posX, posY)` + `clampPerfPosition()` en shared, testeables.

UI en **Ajustes → Avanzado** como `<fieldset>` nuevo sobre `SeccionForm`/`useCaptureSettings`.
**Preview en vivo:** al arrastrar sliders (y al cambiar color/opacidad/disposición) el renderer
manda un IPC de preview (throttled ~30 ms) que mueve/repinta la ventana overlay al instante, sin
esperar al guardado; guardar persiste como siempre.

### 2. Ventana overlay (`PerfOverlayController` en el main)

Controller nuevo (`src/main/perf-overlay.ts`) espejo del `OverlayController` actual: BrowserWindow
transparente, `frame:false`, `focusable:false`, `setIgnoreMouseEvents(true)`, posicionada según
`posX/posY` sobre el work area del monitor primario. Página nueva `perf-overlay.html` (vista
tonta: recibe por IPC métricas + config visual y pinta).

**Clave 1 — no salir en grabaciones:** `win.setContentProtection(true)`. En Windows ≥ 10 2004
Electron lo implementa con `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`: la ventana se ve en
pantalla pero desaparece de cualquier captura (WGC, duplicación DXGI y, trivialmente, del
`game_capture`, que solo ve el swapchain del juego). Cubre clips, grabaciones y capturas propias.

**Clave 2 — debajo de los avisos:** en Windows todas las ventanas topmost comparten banda; el
orden relativo es el orden Z entre ellas. El perf overlay se crea topmost y el `OverlayController`
existente pasa a llamar `win.moveTop()` cada vez que muestra una zona, de forma determinista.

**Hotkey Alt+R:** `globalShortcut` (mismo mecanismo que replay/recording hotkeys) alterna solo la
visibilidad de la ventana; el estado no se persiste como `enabled: false` (es un toggle de vista).

Ciclo de vida: ventana y helpers existen solo con `enabled: true`; se destruyen al desactivar.

### 3. Métricas (`src/main/perf-metrics/`)

Muestreador en el main que emite un snapshot cada 1 s solo con las métricas marcadas:

| Métrica | Fuente | Nota |
|---|---|---|
| Uso de CPU | `os.cpus()` (delta entre muestras) | siempre disponible |
| RAM usada | `os.totalmem() - os.freemem()` | siempre disponible |
| GPU: uso, temp, fans (RPM), voltaje, VRAM; temp CPU | helper **LibreHardwareMonitorLib** | proceso .NET pequeño que emite JSON por stdout cada segundo; NVIDIA/AMD/Intel |
| FPS | helper **PresentMon** (Intel, MIT) | ETW de eventos Present del PID del juego activo (`game-detector`); funciona con cualquier proceso que presente frames — emuladores incluidos |

Cada helper se lanza solo si hay alguna métrica suya marcada y muere al desactivar el overlay.
Sensor ausente o helper caído ⇒ la métrica emite `null` y la página pinta `—`.

**Permisos:** sin elevación, temp de CPU (driver ring0 de LHM) y FPS (sesión ETW) no están
disponibles ⇒ `—` + hint en Ajustes ("requiere ejecutar GameClip como administrador"). Sin
prompts UAC sorpresa en el uso normal.

### 4. Distribución de helpers — bundleados, apuntando a .NET Framework 4.8

Los helpers van **dentro del paquete** (`resources/`), sin descargas en runtime. La clave del
tamaño: el helper de sensores se compila contra **.NET Framework 4.8**, que viene incluido en
Windows 10/11 (LibreHardwareMonitorLib soporta ese target) ⇒ helper ~2 MB sin runtime que
empaquetar. PresentMon es nativo (~2 MB). Total: **+4–5 MB antes de la compresión 7z del
portable** (~5 % de los 93 MB actuales), funciona offline y no toca el proceso de release.

Descartada la descarga bajo demanda (analizada en una iteración previa del plan): exigía red en
la primera activación, sumaba descargador + hash + cache + estados de UI, añadía un asset por
release que podía olvidarse, y ejecutar exes descargados en runtime desde AppData es patrón de
alerta para antivirus. Todo eso para ahorrar ~5 MB — no compensa.

### 5. Auto-inicio como administrador (opt-in)

El auto-inicio actual (clave Run vía `setLoginItemSettings`) no puede elevar: Windows no
auto-eleva apps de inicio. Se añade un checkbox "Iniciar con Windows como administrador" que, con
una única confirmación UAC, crea una **tarea programada** (`schtasks`) al logon con
`RunLevel=Highest` apuntando al exe portable real (`PORTABLE_EXECUTABLE_FILE`, mismo cuidado que
`auto-launch.ts`) y retira la clave Run; desmarcarlo borra la tarea y restaura la clave Run. Así
la app arranca elevada en cada inicio de sesión **sin** prompt UAC recurrente, y FPS + temp de
CPU funcionan desde el arranque.

## Archivos / módulos afectados

- `src/shared/capture.ts` — `PerfOverlaySettings`, defaults, normalización, `presetFor()` y
  `clampPerfPosition()`.
- `src/shared/ipc.ts` — eventos `PerfOverlayData` (métricas+config → página) y preview en vivo.
- `src/main/perf-overlay.ts` — controller de la ventana (nuevo).
- `src/main/perf-metrics/` — sampler + wrappers de helpers + descarga bajo demanda (nuevo).
- `src/main/overlay.ts` — `moveTop()` al mostrar zonas.
- `src/main/auto-launch.ts` (+ módulo nuevo de tarea programada) — auto-inicio elevado opt-in.
- `src/main/index.ts` / `src/main/ipc.ts` — ciclo de vida, hotkey global, re-config en caliente.
- `src/renderer/perf-overlay.html` + entrada React de la página overlay (nuevo).
- `src/renderer/views/ajustes/Avanzado.tsx` — fieldset "Overlay de rendimiento" (sliders con
  preview, preset, checks, hotkey, color, opacidad, admin opt-in).
- `resources/` + config de electron-builder — helpers bundleados (helper LHM net48 + PresentMon).
- Tests en `src/shared/__tests__/`, `src/main/__tests__/`, `src/renderer/__tests__/`.

## Decisiones y alternativas consideradas

- **`setContentProtection(true)`** para excluir el overlay de las grabaciones — descartado
  componer/restar en libobs (no existe) e inyección DX (riesgo anti-cheat inaceptable).
- **Sliders como fuente de verdad + preset derivado** (como NVIDIA App) — descartado un enum fijo
  de 8 posiciones sin sliders: pierde el ajuste fino a lo largo del borde y el preview en vivo.
- **LibreHardwareMonitorLib (helper .NET)** — descartado `nvidia-smi`: solo NVIDIA, sin RPM ni
  voltaje; descartados bindings NVML/ADL propios: triple mantenimiento por vendor.
- **PresentMon** para FPS — descartado derivarlo del hook de `game_capture` (obs-studio-node no
  expone frametimes) y RTSS (dependencia de terceros instalada).
- **Helpers bundleados sobre .NET Framework 4.8 (incluido en Windows)** — descartado
  self-contained (+25–30 MB al portable recién adelgazado), descartada la descarga bajo demanda
  (red obligatoria la primera vez, más código que la feature misma, asset extra por release,
  heurísticas de antivirus sobre exes descargados) y descartado exigir el .NET Runtime moderno
  instalado (rompería la promesa portable).
- **Tarea programada para auto-inicio elevado** — descartado manifest `requireAdministrator`
  (UAC en cada arranque manual y Windows bloquea su clave Run) y descartado relanzarse elevado
  solo (doble proceso + UAC en cada arranque).
- **Toggle Alt+R como estado de vista en memoria** — descartado persistirlo en settings: apagaría
  el overlay "para siempre" desde un atajo pensado para ocultarlo un rato.

## Riesgos

- **Tamaño del portable:** +4–5 MB pre-compresión (~5 %); se mide el antes/después del exe en la
  verificación, como se hizo en `feature-adelgazar-portable`.
- **Antivirus y temp de CPU:** LibreHardwareMonitor carga un driver de kernel (WinRing0) para la
  temperatura de CPU que algunos antivirus marcan, se distribuya como se distribuya. Si el driver
  no carga, esa métrica degrada a `—` sin afectar al resto.
- **Permisos:** sin admin, FPS y temp de CPU degradan a `—`; la solución completa exige el
  opt-in de admin (UAC una vez) o arrancar la app elevada a mano.
- **Tarea programada:** entornos corporativos pueden bloquear `schtasks`; si la creación falla se
  informa y el checkbox vuelve a off (sin estados fantasma).
- **`transparent + setContentProtection`** puede forzar composición por software de esa ventana
  en algunos drivers; overlay pequeño ⇒ impacto esperado mínimo; se verifica con grabación real.
- **Preview en vivo:** mover la ventana a ~30 Hz durante el drag es barato (solo `setPosition`),
  pero se valida que no parpadee con `transparent: true`.
- **Fullscreen exclusivo:** el overlay no se verá (limitación ya conocida); borderless/ventana
  cubiertos. Los FPS sí se miden igualmente (ETW no depende de la ventana).
- **Anti-cheat:** sin inyección (ventana externa + ETW), riesgo bajo.

---

**Estado:** ✅ aprobado el 2026-07-18 · ⏳ refinamiento post-prueba pendiente de OK (ver abajo)

---

## Refinamiento post-prueba (2026-07-18) — pendiente de OK

Tras probar la feature en la rama, el owner pidió tres ajustes. Alcance acotado, misma rama.

### R1. Tamaño de fuente (preset de 3)

`fontSize: 'small' | 'standard' | 'large'` nuevo en `PerfOverlayConfig` (default `standard`), con su
normalización. Un `<select>` más en Ajustes → Avanzado y una clase en la tarjeta del overlay
(`perf-font-small|standard|large`) que fija el `font-size`. Sin impacto en el resto.

### R2 + R3. FPS independientes de la detección y persistentes en segundo plano

**Causa raíz común:** hoy PresentMon apunta a `detectedGame` (`sampler.setGameExe`). Por eso los FPS
solo salen para juegos detectados (R2) y son frágiles al perder foco (R3).

**Rediseño de la fuente de FPS** (aislado a `perf-metrics/presentmon.ts` + wiring):

- PresentMon corre en modo **`-captureall`** (todos los procesos), excluyendo `dwm.exe` (compositor)
  y el ejecutable de la propia GameClip (`-exclude`). Ya **no** se relanza al cambiar de juego: un
  solo proceso vive mientras la métrica FPS esté marcada.
- Se mantiene **un `FpsTracker` por proceso** (mapa exe → tracker), alimentado por la columna
  `Application` del CSV. Se poda lo que deja de presentar (TTL).
- **Selección de qué FPS mostrar** — *enganchado al juego* (decisión del owner, 2026-07-18):
  1. Si el proceso **enganchado** sigue presentando (presents frescos) → se mantiene, aunque otra
     app tenga más tasa. Así los FPS del juego en segundo plano no desaparecen (R3) **y** nunca
     saltan a un vídeo de navegador que abras encima.
  2. Si el enganchado dejó de presentar (o no hay ninguno) → se engancha al proceso con **mayor
     tasa de presents** fuera de la denylist. Cubre cualquier app sin depender de la detección (R2)
     y, con dos juegos, elige el de mayor tasa.
  3. Si nada presenta → `null` (`—`).
- **Sin rastreo de primer plano**: la selección solo mira tasas de presentación, así que no hace
  falta el foreground PID. `game-detector`/`detectedGame` dejan de alimentar los FPS.

**Sin cambios** en: permisos (sigue siendo ETW = admin), exclusión de capturas del overlay, resto de
métricas, empaquetado. `setGameExe` desaparece del sampler.

### R4. Visible sobre juegos sin bordes (detectado probando RE Requiem)

**Causa raíz:** el overlay se creaba con nivel topmost `'floating'` (elegido para quedar bajo los
avisos). Ese nivel **no** basta contra una ventana sin bordes de un juego —el propio
`OverlayController` ya documenta que solo `'screen-saver'` lo consigue—, así que un juego que toma
el foco lo tapaba hasta que un alt+tab reordenaba las ventanas.

**Arreglo:** el overlay pasa a `'screen-saver'` (mismo nivel que los avisos) y, mientras está
visible, se **re-eleva cada 2 s**; justo después re-eleva los avisos (`OverlayController.raise()`),
que comparten banda y por tanto siguen ganando. El re-elevado periódico cubre además el caso de un
juego que arranca *después* del overlay.

### Archivos del refinamiento

- `src/shared/perf.ts` — `fontSize` en config + normalización.
- `src/renderer/views/ajustes/Avanzado.tsx` — `<select>` de tamaño.
- `src/renderer/perf-overlay/PerfOverlay.tsx` + `styles.css` — clase de tamaño.
- `src/main/perf-metrics/presentmon.ts` — `-captureall`/`-exclude`, tracker por proceso, selección
  con enganche.
- `src/main/perf-metrics/sampler.ts` + `src/main/index.ts` — se quita `setGameExe`; PresentMon vive
  mientras la métrica FPS esté marcada.
- `src/main/perf-overlay.ts` — nivel `screen-saver` + re-elevado periódico (R4).
- `src/main/overlay.ts` — `raise()` para re-elevar los avisos visibles (R4).
- Tests de los cuatro puntos.

### Riesgos del refinamiento

- Cold start: si un vídeo a 60 fps ya está sonando cuando el juego arranca capado a 30, en la
  primera selección ganaría el vídeo por tasa; en cuanto el juego pasa a primer plano y sube su
  tasa, o el vídeo se pausa, se re-engancha al juego. Caso de borde poco común.
- `-captureall` procesa más eventos ETW que el modo apuntado; los eventos Present son baratos y ya
  se filtra por denylist, impacto esperado mínimo (se observa en la verificación).
