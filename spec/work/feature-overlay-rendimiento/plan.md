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

### 4. Distribución de helpers — sin engordar el portable

Los helpers **no van dentro del exe**: se publican como asset del release de GitHub
(`gameclip-perf-helpers-X.Y.Z.zip`) y GameClip los descarga **bajo demanda** la primera vez que se
activa una métrica que los necesita, a la carpeta de datos de la app (junto a la config), con
verificación de hash SHA-256 y un estado visible en Ajustes ("descargando herramientas de
métricas…"). Quedan cacheados; sin red, las métricas de helper muestran `—` con hint.

El helper LHM se publica **framework-dependent** (~1–2 MB) si el .NET Desktop Runtime está
presente; si no, el zip self-contained (~25 MB) — la detección la hace GameClip antes de elegir
qué descargar. PresentMon son ~2 MB. El exe portable no crece nada.

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
- Pipeline de release — publicar `gameclip-perf-helpers-X.Y.Z.zip` como asset.
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
- **Descarga bajo demanda de helpers** — descartado bundlear self-contained (+25 MB al portable)
  y descartado exigir .NET instalado sin alternativa (rompería la promesa portable).
- **Tarea programada para auto-inicio elevado** — descartado manifest `requireAdministrator`
  (UAC en cada arranque manual y Windows bloquea su clave Run) y descartado relanzarse elevado
  solo (doble proceso + UAC en cada arranque).
- **Toggle Alt+R como estado de vista en memoria** — descartado persistirlo en settings: apagaría
  el overlay "para siempre" desde un atajo pensado para ocultarlo un rato.

## Riesgos

- **Descarga bajo demanda:** requiere red la primera vez; sin red ⇒ `—` + hint. El zip va
  versionado y verificado por hash; el proceso de release gana un asset más que mantener.
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

**Estado:** ⏳ pendiente de aprobación
