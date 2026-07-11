# Plan — Settings avanzados (paridad con las apps de clips)

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.
> *Nota: en esta sesión el owner delegó la aprobación del plan al agente.*

## Enfoque

Cuatro frentes sobre la arquitectura existente (modelo compartido → store JSON → IPC → pipeline
libobs → UI), en tres pasos: **fundación secuencial** (contratos) y luego **tres agentes en
paralelo** sobre áreas disjuntas del árbol.

### 1. Modelo de settings (fundación, inline)

`src/shared/capture.ts` crece con los campos nuevos; `normalizeCaptureSettings` valida campo a
campo como hasta ahora:

```
fps: 24 | 30 | 60 | 120 | 144
bitrateMbps: number            // 0 = automático (presets de calidad actuales); 3–100 si custom
micDeviceId: string            // '' = dispositivo por defecto
micVolume: number              // 0–100
audioMode: 'desktop' | 'apps'
desktopAudioVolume: number     // 0–100 (modo desktop)
gameAudioEnabled: boolean      // modo apps: capturar el audio del juego detectado
gameAudioVolume: number
audioApps: { executable: string; volume: number }[]   // modo apps (máx. 8, sin duplicados)
separateAudioTracks: boolean
storageLimitGb: number         // 0 = sin límite
autoDeleteOldest: boolean
onlyDeleteRecordings: boolean
useRecycleBin: boolean
advancedWindowCapture: boolean
experimentalCapture: boolean
hdrCompatibility: boolean
forceWindowCapture: boolean
showMouseCursor: boolean
recordingBuffer: 'disk' | 'memory'
aspectRatio: 'game' | 'stretch169' | 'bars169' | 'crop169'
```

Los "presets" de calidad de la UI (Baja/Estándar/Alta/Personalizada) **no se persisten**: son
azúcar de UI que fija `resolution+fps+bitrateMbps`; se infiere el preset activo desde los valores.

IPC nuevo (en la fundación quedan canal + preload + handler llamando a stubs tipados):

- `capture:get-audio-devices` → `AudioDeviceInfo[]` (micrófonos vía propiedades de
  `wasapi_input_capture` en libobs).
- `capture:get-audio-apps` → `AudioAppInfo[]` (procesos con ventana, vía PowerShell/tasklist,
  patrón de `game-detector`).
- `library:get-storage-stats` → `{ clipsBytes, recordingsBytes, driveFreeBytes, driveTotalBytes }`
  (suma del repo SQLite + `fs.statfsSync`).
- `settings:pick-output-dir` → `dialog.showOpenDialog` (carpeta) y devuelve la ruta o `null`.

### 2. Pipeline libobs (Agente A — alta complejidad)

`src/main/capture/obs.ts`:

- **Migrar de `SimpleRecordingFactory`/`SimpleReplayBufferFactory` a
  `AdvancedRecordingFactory`/`AdvancedReplayBufferFactory`** para obtener tracks de audio
  múltiples y bitrate real. `AudioTrackFactory.create(bitrate, name)` + `setAtIndex`. El mapeo
  de calidad automática (sin bitrate) pasa a settings de encoder (x264: CRF 23/18/0 ·
  NVENC/AMF/QSV: CQP 23/20/16) y con `bitrateMbps > 0` → CBR.
- **Audio:** mic `wasapi_input_capture` con `device_id: micDeviceId` y `volume`; modo desktop =
  `wasapi_output_capture` con volumen; modo apps = un `wasapi_process_output_capture` por app
  (`window: '::exe'`, prioridad ejecutable) + el del juego detectado si `gameAudioEnabled`
  (se re-liga al cambiar el juego detectado; el manager ya reconstruye pipeline con settings).
  Tracks: escritorio/juego → 1, mic → 2, apps → 3+ si `separateAudioTracks`; todo → 1 si no.
- **Enumeración de micrófonos:** input temporal `wasapi_input_capture` + iterar `properties`
  hasta `device_id` y leer `details.items`; release inmediato.
- **Avanzado:** `showMouseCursor` → `capture_cursor` en monitor/game capture; `hdrCompatibility`
  → `rgb10a2_space: '2100pq'` en game capture; `advancedWindowCapture` → método WGC en
  monitor_capture; `experimentalCapture` → `capture_overlays` en game capture;
  `forceWindowCapture` → `capture_mode: 'window'`. `aspectRatio` → canvas/salida 16:9 +
  `boundsType` del scene item (`SCALE_INNER` barras · `SCALE_OUTER` crop · stretch = solo salida
  16:9). `recordingBuffer`: sin efecto real hoy (limitación documentada en el spec).
- Extender el tipado mínimo `OsnModule`/interfaces y `FakeObs` de los tests.

`src/main/capture/manager.ts`: exponer `getAudioDevices()`, pasar el juego detectado al
pipeline. `src/main/capture/audio-apps.ts` (nuevo): enumerar procesos con ventana.

### 3. Almacenamiento (Agente B — media complejidad)

`src/main/library/storage-manager.ts` (nuevo): dado settings + repo de clips, `enforceLimit()`
ordena por `created_at` ascendente y borra hasta quedar bajo `storageLimitGb`, filtrando
`source === 'recording'` si `onlyDeleteRecordings`, vía `shell.trashItem` si `useRecycleBin`
(inyectable para tests). Se dispara al registrar un clip nuevo y al arrancar. Nunca borra el
clip recién creado. `getStorageStats()` para el IPC. Wiring en `src/main/index.ts`.

### 4. UI de Ajustes (Agente C — media complejidad)

`src/renderer/views/ajustes/` (nuevo): layout con sub-nav (rutas anidadas de React Router bajo
`/ajustes/*`, redirect a `general`) y cinco secciones: **General** (hotkey, replaySeconds,
bufferMode, overlay, autoLaunch) · **Calidad** (preset cards + resolución/FPS/bitrate/encoder)
· **Audio** (mic: dispositivo+volumen; modo escritorio/apps; lista de apps con volumen; tracks
separados) · **Almacenamiento** (carpeta + diálogo, límite, toggles de borrado, barra de uso)
· **Avanzado** (toggles, buffer, aspect ratio). Hook compartido `useCaptureSettings` (cargar /
mutar / guardar por sección, patrón actual de guardado explícito). `Ajustes.tsx` se elimina.

### Paralelización

Fundación inline (contratos + stubs para que el typecheck quede verde) → Agentes A (main/capture),
B (main/library) y C (renderer) en paralelo: áreas de archivos disjuntas, sin conflictos.
Después: revisión de todo el diff por el agente principal, gates y selftest E2E
(`GAMECLIP_SELFTEST=recording`, ffprobe para tracks, juego falso `Terraria.exe` si hace falta).

## Archivos / módulos afectados

- `src/shared/capture.ts` — campos nuevos + defaults + normalización; tipos `AudioDeviceInfo`,
  `AudioAppInfo`, `StorageStats`.
- `src/shared/ipc.ts` — canales y contrato de los 4 IPC nuevos.
- `src/preload/index.ts` — exponer los métodos nuevos.
- `src/main/ipc.ts` — handlers nuevos.
- `src/main/capture/obs.ts` — Advanced factories, audio multi-fuente, tracks, bitrate, mapeos avanzados.
- `src/main/capture/manager.ts` — dispositivos de audio, juego detectado hacia el pipeline.
- `src/main/capture/audio-apps.ts` — **nuevo**, enumeración de apps.
- `src/main/library/storage-manager.ts` — **nuevo**, límite/auto-borrado/stats.
- `src/main/index.ts` — wiring de storage manager y diálogo de carpeta.
- `src/renderer/views/ajustes/*` — **nuevo** layout + 5 secciones; `App.tsx` rutas anidadas;
  `Ajustes.tsx` eliminado; `styles.css` sub-nav, cards, sliders, barra de disco.
- Tests en `src/shared/__tests__`, `src/main/__tests__`, `src/renderer/__tests__`.

## Decisiones y alternativas consideradas

- **Advanced factories en vez de Simple** — Simple no soporta tracks múltiples ni bitrate sin
  streaming configurado. Alternativa descartada: quality=Stream + SimpleStreaming (frágil, atado
  al flujo de streaming). El selftest E2E en máquina real mitiga el riesgo de la migración.
- **Enumerar micrófonos vía libobs y no `navigator.mediaDevices`** — los `deviceId` de Chromium
  son hashes, no los endpoint IDs WASAPI que libobs necesita.
- **Apps de audio = procesos con ventana** (PowerShell) y no sesiones de audio WASAPI reales —
  enumerar sesiones exigiría un addon nativo; fuera de presupuesto para esta fase.
- **Presets de calidad como azúcar de UI** y no campo persistido — evita estados incoherentes
  (preset ≠ valores); el preset se infiere de los valores.
- **Guardado explícito por sección** (botón) — mantiene el patrón y los tests actuales; auto-save
  queda como mejora futura.
- **`recordingBuffer` sin efecto real** — documentado; la alternativa (grabación segmentada
  continua a disco propia) es una fase entera en sí misma.

## Riesgos

- La migración Simple→Advanced cambia señales/comportamiento de libobs → mitigar con selftest
  E2E real en esta máquina (grabación 4 s + ffprobe) antes de dar por bueno.
- `wasapi_process_output_capture` requiere Windows 10 2004+ y que la build de osn lo incluya →
  degradar con try/catch a `wasapi_output_capture` y estado visible si falta.
- Volúmenes vía `input.volume` (fader) pueden no mapear 1:1 con percepción — aceptable, es lo
  que expone osn.
- `fs.statfsSync` requiere Node ≥ 18.15 — Electron 29 trae Node 20.9, OK.
- Tres agentes en paralelo → riesgo de solaparse en archivos compartidos; mitigado dejando
  `shared/ipc/preload` cerrados en la fundación.

---

**Estado:** ✅ aprobado el 2026-07-11 (aprobación delegada por el owner en esta sesión)
