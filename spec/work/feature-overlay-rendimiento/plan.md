# Plan — Overlay de rendimiento configurable

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Cuatro piezas: ajustes → ventana overlay → muestreo de métricas → integración con los overlays
existentes.

### 1. Ajustes (`perfOverlay` en `CaptureSettings`)

Un objeto anidado nuevo (a diferencia de los campos planos existentes, son ~13 campos que viajan
juntos):

```ts
interface PerfOverlaySettings {
  enabled: boolean;
  metrics: {
    fps; gpuUsage; gpuTemp; gpuFan; gpuVoltage; vram;
    cpuUsage; cpuTemp; ram;            // todos boolean
  };
  position: 'top-left' | 'top-right' | 'top-center' | 'bottom-left' | 'bottom-right';
  layout: 'horizontal' | 'vertical';   // apaisado | desglosado
  textColor: string;                    // hex #RRGGBB
  bgOpacity: number;                    // 0–100
}
```

Con su `normalizePerfOverlay()` campo a campo (mismo patrón que el resto del archivo) y defaults:
desactivado, FPS+GPU%+CPU% marcados, `top-left`, `vertical`, blanco, opacidad 40.

La UI vive en **Ajustes → Avanzado** como `<fieldset>` nuevo, reusando `SeccionForm` /
`useCaptureSettings` (guardar aplica en caliente vía el evento settings-changed existente).

### 2. Ventana overlay (`PerfOverlayController` en el main)

Controller nuevo (`src/main/perf-overlay.ts`) espejo del `OverlayController` actual: BrowserWindow
transparente, `frame:false`, `focusable:false`, `setIgnoreMouseEvents(true)`, posicionada según
`position` en el work area del monitor primario. Página nueva `perf-overlay.html` (vista tonta:
recibe por IPC las métricas + la config visual y pinta).

**Clave 1 — no salir en grabaciones:** `win.setContentProtection(true)`. En Windows ≥ 10 2004
Electron lo implementa con `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`: la ventana se ve en
pantalla pero desaparece de cualquier captura (WGC, duplicación DXGI y, trivialmente, del
`game_capture`, que solo ve el swapchain del juego). Cubre clips, grabaciones y capturas de
pantalla propias.

**Clave 2 — debajo de los avisos:** en Windows todas las ventanas topmost comparten banda; el
orden relativo es el orden Z entre ellas. El perf overlay se crea topmost nivel `'floating'` y el
`OverlayController` existente pasa a llamar `win.moveTop()` cada vez que muestra una zona
(`showInactive()` ya casi lo garantiza; el `moveTop()` explícito lo hace determinista). Así REC,
toast y aviso de juego quedan siempre por encima.

Ciclo de vida: la ventana existe solo con `enabled: true`; se destruye al desactivar (criterio de
aceptación: sin ventana ni helper cuando está apagado).

### 3. Métricas (`src/main/perf-metrics/`)

Muestreador en el main que emite un snapshot cada 1 s solo con las métricas marcadas. Tres
fuentes, cada una con su disponibilidad:

| Métrica | Fuente | Nota |
|---|---|---|
| Uso de CPU | `os.cpus()` (delta entre muestras) | siempre disponible |
| RAM usada | `os.totalmem() - os.freemem()` | siempre disponible |
| GPU: uso, temp, fans (RPM), voltaje, VRAM; temp CPU | helper **LibreHardwareMonitorLib** | proceso .NET pequeño bundleado que emite JSON por stdout cada segundo; cubre NVIDIA/AMD/Intel |
| FPS | helper **PresentMon** (Intel, MIT) | ETW de eventos Present del PID del juego detectado (`game-detector` ya lo conoce); CSV por stdout |

Cada helper se lanza solo si hay alguna métrica suya marcada, y se mata al desactivar el overlay.
Sensor ausente o helper caído ⇒ la métrica emite `null` y la página pinta `—`; nada más se cae.

**Permisos (decisión a validar con el owner):** sin elevación, la temperatura de CPU (driver
ring0 de LHM) y PresentMon (sesión ETW) pueden no estar disponibles. Propuesta: intentar sin
elevación; si el helper falla por permisos, la métrica muestra `—` y en Ajustes aparece un hint
("requiere ejecutar GameClip como administrador"). Sin prompts UAC sorpresa.

### 4. Wiring

`capture/manager.ts` (o `index.ts`, donde vive el `OverlayController`) instancia el
`PerfOverlayController` con los settings, lo re-configura en el evento settings-changed y le pasa
el PID del juego activo para PresentMon.

## Archivos / módulos afectados

- `src/shared/capture.ts` — tipo `PerfOverlaySettings`, default y normalización.
- `src/shared/ipc.ts` — evento nuevo `PerfOverlayData` (métricas + config visual hacia la página).
- `src/main/perf-overlay.ts` — controller de la ventana (nuevo).
- `src/main/perf-metrics/` — sampler + wrappers de los dos helpers (nuevo).
- `src/main/overlay.ts` — `moveTop()` al mostrar zonas.
- `src/main/index.ts` / `src/main/ipc.ts` — ciclo de vida y re-configuración en caliente.
- `src/renderer/perf-overlay.html` + entrada React de la página overlay (nuevo).
- `src/renderer/views/ajustes/Avanzado.tsx` — fieldset "Overlay de rendimiento".
- `resources/` + config de build — binarios de los helpers (LHM helper y PresentMon).
- Tests en `src/shared/__tests__/`, `src/main/__tests__/`, `src/renderer/__tests__/`.

## Decisiones y alternativas consideradas

- **`setContentProtection(true)`** para excluir el overlay de las grabaciones — alternativa
  descartada: pintar el overlay dentro del pipeline de libobs como source y "restarlo" del encode
  (no existe tal resta) o componer el overlay solo en pantalla vía inyección DX (complejidad de
  driver anti-cheat inaceptable).
- **LibreHardwareMonitorLib (helper .NET)** para sensores — descartado `nvidia-smi`: solo NVIDIA
  y no expone RPM de fans ni voltaje; descartados bindings nativos NVML/ADL propios: triple
  mantenimiento por vendor.
- **PresentMon** para FPS — descartado derivarlo del hook de `game_capture` (obs-studio-node no
  expone frametimes) y descartado RTSS (dependencia de app de terceros instalada).
- **Objeto anidado `perfOverlay`** en settings — descartados 13 campos planos: ensuciarían
  `CaptureSettings` y la normalización.
- **Ventana única reposicionable** — descartado reutilizar las dos ventanas del
  `OverlayController`: tienen otro ciclo de vida (aparecen solo con contenido) y el perf overlay
  es persistente.

## Riesgos

- **Permisos:** FPS y temp de CPU pueden requerir admin (ETW / driver ring0). Mitigación:
  degradar a `—` + hint en Ajustes. Si el owner prefiere prompt UAC para los helpers, se decide
  antes de codear.
- **Peso del portable:** PresentMon (~2 MB) + helper .NET. LHM requiere .NET runtime: se
  publicará *self-contained trimmed* (~15–30 MB) o se exige .NET Desktop Runtime instalado —
  a decidir con el owner (impacta el tamaño del exe portable).
- **`transparent + setContentProtection`** en algunas GPUs/drivers puede forzar composición por
  software de esa ventana; overlay pequeño ⇒ impacto esperado mínimo, se verifica en la
  comprobación manual con grabación real.
- **Fullscreen exclusivo:** el overlay no se verá (limitación ya conocida del overlay actual);
  borderless/ventana cubiertos.
- **Anti-cheat:** no inyectamos nada en el juego (ventana externa + ETW), riesgo bajo; PresentMon
  es lectura pasiva de eventos del sistema.

---

**Estado:** ⏳ pendiente de aprobación
