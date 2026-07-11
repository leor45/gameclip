# Plan — Audio avanzado (PTT, supresión de ruido, lista estilo de las apps de clips) + Development Mode

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.
> *Nota: la aprobación sigue delegada al agente en esta sesión (mismo mandato de la Fase 7).*

## Enfoque

Trabajo secuencial inline (un solo agente): las piezas comparten el modelo y la fuente de
micrófono, no conviene paralelizar.

### 1. Modelo (`src/shared/capture.ts`)

- `AudioAppCapture` gana `enabled: boolean` (normalización: default `true` → migra ajustes viejos).
- Campos nuevos: `pttEnabled: boolean` (false) · `pttHotkey: string` ('F9'; nombres de
  `UiohookKey` o 'Mouse4'/'Mouse5') · `noiseSuppressionEnabled: boolean` (false) ·
  `hardwareAcceleration: boolean` (true).
- `DEFAULT_AUDIO_APPS = ['Discord.exe']`: apps fijas de la lista (la UI las muestra siempre;
  su estado vive en `audioApps` cuando el usuario las toca; sin entrada = desactivada).

### 2. Push-to-talk (`src/main/capture/push-to-talk.ts`, nuevo)

- Clase `PushToTalk` (EventEmitter) sobre `uiohook-napi` con **require perezoso y falible**
  (patrón de `obs.ts` con osn): si el módulo no carga, `available = false` y no rompe nada.
- `configure(enabled, hotkey)`: arranca/detiene `uIOhook` y resuelve el keycode con
  `UiohookKey[hotkey]` (o botón 4/5 para 'Mouse4'/'Mouse5'). Emite `'held'` (true/false) en
  keydown/keyup del keycode configurado. Mapeo hotkey→keycode como **helper puro exportado**
  (testeable); el hook real se inyecta en tests con un emisor fake.
- `IpcChannel` nuevo `capture:get-ptt-available` (preload + handler) para que la UI muestre el
  aviso si el hook no cargó.

### 3. Pipeline y manager

- `obs.ts`: guardar `micSource`; nuevo método `setMicMuted(muted)` (en `CaptureBackend` también)
  para PTT sin rebuild. En `buildPipeline`: mute inicial del mic =
  `!micEnabled || pttEnabled` (con PTT el mic arranca cerrado hasta pulsar). Con
  `noiseSuppressionEnabled`, crear `FilterFactory.create('noise_suppress_filter', …,
  { method: 'rnnoise' })` y `mic.addFilter(...)` (release del filtro en teardown). En modo apps,
  crear capturas por proceso **solo de `audioApps` con `enabled: true`**.
- `manager.ts`: `setMicHeld(held)` → `obs.setMicMuted(!micEnabled || (pttEnabled && !held))`;
  el estado `held` se conserva y el mute se recalcula tras cada rebuild/cambio de ajustes.
- `index.ts`: instanciar `PushToTalk`, `on('held')` → `capture.setMicHeld`, reconfigurar en el
  evento `'settings'`, `stop()` en `will-quit`.

### 4. Aceleración por hardware (`src/main/index.ts`)

- Crear el `SettingsStore` una sola vez **a nivel de módulo** (no depende de Electron-ready;
  `app.getPath('userData')` funciona antes de `ready`) y, si
  `hardwareAcceleration === false`, llamar `app.disableHardwareAcceleration()` antes de
  `whenReady`. `setupCapture` reutiliza esa instancia.

### 5. UI (`src/renderer/views/ajustes/`)

- **Audio** rediseñada: en modo apps, lista estilo de las apps de clips — filas fijas *Audio del juego*
  (gameAudioEnabled/Volume), *Micrófono* (micEnabled/micVolume) y *Discord* (entrada de
  `DEFAULT_AUDIO_APPS`, siempre visible, checkbox sin basurero); apps del usuario con checkbox
  a la izquierda + botón icono-basurero rojo (`aria-label` "Quitar <app>"). Debajo del bloque
  de micrófono: toggle *Push to talk* + select de tecla (F1–F12, Ctrl, Alt, Shift, Space,
  CapsLock, Mouse4, Mouse5) + aviso si el hook no está disponible; toggle *Supresión de ruido*.
- **Desarrollo** (sección nueva en el sub-nav y rutas): toggle *Aceleración por hardware* con
  advertencia roja estilo de las apps de clips + nota "requiere reiniciar GameClip".

## Archivos / módulos afectados

- `src/shared/capture.ts` — campos, `enabled` en apps, `DEFAULT_AUDIO_APPS`, mapeo de teclas PTT.
- `src/shared/ipc.ts` · `src/preload/index.ts` · `src/main/ipc.ts` — canal `capture:get-ptt-available`.
- `src/main/capture/push-to-talk.ts` — **nuevo**.
- `src/main/capture/obs.ts` — micSource, setMicMuted, filtro de ruido, filtro de apps enabled.
- `src/main/capture/manager.ts` — setMicHeld + recálculo de mute.
- `src/main/index.ts` — hw accel pre-ready, wiring PTT, store único.
- `src/renderer/views/ajustes/Audio.tsx` (rediseño) · `Desarrollo.tsx` (**nuevo**) ·
  `AjustesLayout.tsx` · `App.tsx` · `styles.css`.
- Tests: `capture.test.ts`, `push-to-talk.test.ts` (nuevo), `capture-manager.test.ts`,
  `ajustes.test.tsx`, setup de mocks.
- `package.json` — dependencia `uiohook-napi@1.5.5`.

## Decisiones y alternativas consideradas

- **`uiohook-napi` para PTT** — `globalShortcut` de Electron no emite keyup, y el hotkey system
  de osn exige un hook propio igualmente (así lo hace Streamlabs). N-API prebuilt = sin
  recompilación por ABI de Electron. Alternativa descartada: iohook (abandonado, ABI frágil).
- **RNNoise sin slider** — el filtro `noise_suppress_filter` en método rnnoise no usa umbral
  de dB; el slider de las apps de clips aplica a su motor propio. Toggle simple y honesto.
- **Discord fijo vía `DEFAULT_AUDIO_APPS`** en shared y no hardcodeado en la UI — el pipeline
  y la UI comparten la fuente de verdad; añadir otra app por defecto es una línea.
- **`enabled` default true en normalización** — migra los `audioApps` guardados por la Fase 7
  sin tocar disco.
- **Hw accel leída pre-ready del mismo JSON** — alternativa descartada: archivo aparte o
  localStorage del renderer (llega tarde: `disableHardwareAcceleration` debe correr antes de
  crear ventanas).

## Riesgos

- `uiohook-napi` necesita el prebuilt win32-x64 al instalar → verificar `npm install` y que
  cargue dentro de Electron; si falla, la degradación mantiene el resto de la feature.
- El hook global escucha todo el teclado (solo keycode configurado se usa); documentado aquí
  — no se registra ni persiste nada más.
- `noise_suppress_filter` podría no venir en la build de osn → creación en try/catch; sin
  filtro el mic sigue funcionando.
- Releases del filtro en teardown: seguir el patrón best-effort existente.

---

**Estado:** ✅ aprobado el 2026-07-11 (aprobación delegada por el owner en esta sesión)
