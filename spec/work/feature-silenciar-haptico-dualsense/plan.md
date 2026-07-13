# Plan — Silenciar el háptico del DualSense en la captura

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Replicar, de forma automática, la acción manual que ya funciona: **mutear la sesión de audio de
`obs64.exe` en el dispositivo del DualSense**. Se hace vía la API **Windows Core Audio**
(`IMMDeviceEnumerator` → `IAudioSessionManager2` → `ISimpleAudioVolume`) desde un **helper nativo
propio** que GameClip invoca en cada arranque de captura.

**Forma del helper: un `.exe` nativo independiente** (C++/Win32, sin runtime), no un addon N-API.
Motivos:
- Sin acoplamiento de ABI con Electron (un addon habría que recompilarlo por versión de Electron,
  como `better-sqlite3`); un `.exe` es indiferente a la versión.
- Aislado: si el código COM falla, no tumba el proceso main de Electron.
- Se integra con `execFile` + código de salida, igual que hoy se hace con PowerShell en
  [`audio-apps.ts`](../../../src/main/capture/audio-apps.ts), y el wrapper TS se testea mockeando
  `execFile`.

**Contrato del helper (CLI):**
```
gc-app-audio-mute.exe --device "DualSense" --process "obs64.exe" [--mute|--unmute]
```
- Enumera endpoints de render; elige el primero cuyo *friendly name* contiene `--device`
  (case-insensitive).
- En ese dispositivo enumera sesiones (`IAudioSessionEnumerator`) y matchea las cuyo proceso
  (`GetProcessId` → `QueryFullProcessImageName` → basename) sea `--process`.
- Aplica `ISimpleAudioVolume::SetMute(true)` a **todas** las que matcheen (puede haber más de una).
- Códigos de salida: `0` aplicado · `2` dispositivo no encontrado · `3` sin sesión del proceso ·
  `1` error. `stdout` mínimo (una línea de diagnóstico).

Se usa **SetMute**, no bajar volumen a 0: efecto idéntico, más robusto y reversible, y no pisa el
nivel que el usuario pudiera haber puesto a mano.

**Orquestación (lado GameClip):** tras cada `rebuildPipeline()` y arranque de buffer/grabación, el
manager llama a un wrapper que ejecuta el helper con **reintento corto** (cada ~250 ms hasta ~3 s),
porque la sesión WASAPI de `obs64.exe` en el DualSense aparece un instante *después* de que la
captura por proceso abra su stream. Es idempotente: mutear una sesión ya muteada es inocuo.

## Archivos / módulos afectados

- `native/app-audio-mute/` **(nuevo)** — fuente C++ del helper (`main.cpp`) + `README` de build.
- `scripts/build-haptic-mute.ps1` **(nuevo)** — compila el `.exe` con `cl.exe` (MSVC Build Tools).
- `resources/gc-app-audio-mute.exe` **(artefacto de build, git-ignored)** — lo genera
  `build-haptic-mute.ps1`; se compila en `build:portable` y no vive en git. Ver decisión abajo.
- `.gitignore` — excluye `resources/gc-app-audio-mute.exe`.
- `package.json` — script `build:native` (compila el helper) y `build:portable` lo encadena antes
  de `electron-builder`.
- `src/main/capture/app-audio-mute.ts` **(nuevo)** — wrapper TS: resuelve la ruta del helper
  (dev vs empaquetado/`process.resourcesPath`), lo ejecuta con `execFile`, reintenta, traduce el
  código de salida. Best-effort: nunca lanza hacia arriba.
- `src/main/capture/manager.ts` — invocar el wrapper tras `rebuildPipeline()` y en
  `startBuffer`/`startRecording` cuando la función esté activada.
- `src/shared/capture.ts` — nuevos ajustes `hapticMuteEnabled: boolean` (default `false`) y
  `hapticMuteDevicePattern: string` (default `'DualSense'`), con su normalización.
- `src/renderer/views/ajustes/Audio.tsx` — checkbox "Silenciar el háptico del mando en la
  grabación" + campo de patrón de dispositivo (con hint explicando qué hace y cuándo activarlo).
- `electron-builder` config (`package.json`/`electron-builder.yml`) — incluir
  `resources/gc-app-audio-mute.exe` en `extraResources`.
- Tests: `src/main/__tests__/app-audio-mute.test.ts` **(nuevo)**.

## Decisiones y alternativas consideradas

- **`.exe` nativo propio** vs addon N-API — elegido el `.exe` por lo dicho en Enfoque (sin ABI, más
  aislado, encaja con el patrón `execFile` existente).
- **`.exe` propio** vs bundlear `svcl.exe` (NirSoft) — descartado NirSoft: binario de terceros con
  términos de redistribución y falsos positivos frecuentes de antivirus. (Decisión del owner.)
- **Git-ignorar el binario y compilarlo en `build:portable`** (decisión del owner, revisada) — los
  artefactos de build no van a git. El fuente + `build-haptic-mute.ps1` quedan versionados y el `.exe`
  se genera al empaquetar. Coste asumido: la máquina que empaqueta necesita toolchain C++ (MSVC o
  MinGW/WinLibs); el script la localiza en PATH o en la instalación de winget. En dev el `.exe` se
  lee de `resources/` si está (no-op si no), así que basta generarlo una vez tras un clon.
- **SetMute** vs poner volumen a 0 — SetMute por robustez y por no pisar niveles del usuario.
- **Match por nombre de proceso** (`obs64.exe`) vs por PID del host OSN — nombre por simplicidad y
  porque no exige que el manager conozca/propague el PID; se mutean todas las sesiones que matcheen.
- **Reaplicar en cada arranque** (no un servicio que vigile) — el problema es exactamente que la
  sesión se recrea al reconstruir la captura; reaplicar en ese punto es suficiente y sin coste en
  reposo.

## Riesgos

- **Timing de la sesión:** si el reintento se queda corto, no encuentra la sesión y no mutea. Mitiga
  el poll ~3 s; si hiciera falta, se amplía. Fallo = degradación (vuelve el zumbido), no crash.
- **Variación del nombre del dispositivo** ("DualSense Wireless Controller" vs otros): por eso el
  patrón es configurable; el default cubre el caso común.
- **SmartScreen/antivirus** sobre un `.exe` propio sin firmar: menos probable que con NirSoft, pero
  para distribución conviene firmar el binario (fuera de alcance ahora; se anota).
- **Empaquetado:** que el `.exe` no llegue a `resources/` en el portable → criterio de aceptación
  explícito de instalación limpia.
- **El helper nativo no entra en la suite unitaria** (COM + hardware): se cubre con verificación
  manual/E2E; lo unit-testeable es el wrapper TS.
- **Cambio de comportamiento de Windows** (que el volumen/mute por-sesión dejara de existir): es la
  misma superficie que el arreglo manual actual, así que el riesgo es el mismo que ya asume el owner.
- **Interferencia con `temp-cleanup`:** ninguna esperada, pero es un invariante a respetar — el
  helper debe ser **efímero** (enumerar → `SetMute` → salir, sin handle persistente) y correr desde
  la extracción en curso. Así no puede bloquear el renombrado/borrado de extracciones anteriores
  ([`temp-cleanup.ts`](../../../src/main/temp-cleanup.ts), regla 3), y al vivir dentro del payload
  se limpia solo con él (no añade marcadores nuevos ni carpetas huérfanas).

---

**Estado:** ✅ aprobado el 2026-07-12
