# Tasks — Silenciar el háptico del DualSense en la captura

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

### Ajustes (dominio, sin nativo)

- [x] 1. `src/shared/capture.ts` — añadir `hapticMuteEnabled: boolean` (default `false`) y
       `hapticMuteDevicePattern: string` (default `'DualSense'`) a `CaptureSettings`,
       `DEFAULT_CAPTURE_SETTINGS` y `normalizeCaptureSettings` (patrón: `bool`/string con trim).
- [x] 2. `src/renderer/views/ajustes/Audio.tsx` — fieldset "Mando": checkbox
       "Silenciar el háptico del mando en la grabación" + campo de patrón de dispositivo
       (deshabilitado si el checkbox está off) + hints.

### Helper nativo

- [x] 3. `native/app-audio-mute/main.cpp` — CLI Core Audio:
       `--device <patrón> --process <exe> [--mute|--unmute]`. Enumera endpoints de render,
       matchea por *friendly name* que contenga el patrón (case-insensitive), enumera sesiones,
       matchea por basename del proceso y aplica `ISimpleAudioVolume::SetMute`. Códigos de
       salida: 0 ok · 2 sin dispositivo · 3 sin sesión · 1 error. Sin escrituras a disco.
- [x] 4. `native/app-audio-mute/README.md` — cómo compilar y contrato de la CLI.
- [x] 5. `scripts/build-haptic-mute.ps1` — compila con `cl.exe` (`/MT`) o, en su defecto, `g++`
       (MinGW), y deja el binario en `resources/gc-app-audio-mute.exe`.
- [x] 6. Toolchain + binario: instalado WinLibs (MinGW-w64) por winget; `.exe` compilado **estático**
       (sin DLLs de runtime de MinGW; solo KERNEL32/ole32/UCRT). Git-ignored + `build:native` y
       `build:portable` lo generan. Smoke test de códigos de salida (1/2/3) OK.

### Integración

- [x] 7. `src/main/capture/app-audio-mute.ts` — wrapper TS: resuelve la ruta del helper
       (`process.resourcesPath` empaquetado / `cwd/resources` en dev; null si no está → no-op),
       lo ejecuta con `execFile`, **reintenta** (~250 ms hasta ~3 s) hasta código 0 o timeout.
       Best-effort: nunca lanza; helper efímero (respeta el invariante de `temp-cleanup`).
- [x] 8. `src/main/capture/manager.ts` — `reapplyHapticMute()` (fire-and-forget) cuando
       `hapticMuteEnabled`, invocado en `startBuffer`, `doStartRecording` y `startSessionRecording`.
       No bloquea el arranque de la captura.
- [x] 9. Empaquetado — `extraResources` en `electron-builder.yml` incluye
       `resources/gc-app-audio-mute.exe` → `gc-app-audio-mute.exe` en el portable.

## Tests unitarios (obligatorios)

`src/main/__tests__/app-audio-mute.test.ts` — deps inyectadas con reloj simulado (patrón de
[`audio-apps.test.ts`](../../../src/main/__tests__/audio-apps.test.ts)):

- [x] Construye los argumentos correctos del helper a partir de proceso + patrón de dispositivo.
- [x] Reintenta mientras el helper devuelve "sin sesión" (código 3) y para al obtener 0.
- [x] Se rinde tras el timeout sin lanzar (degradación silenciosa).
- [x] No-op si no hay binario (helperPath null) o el patrón está vacío.
- [x] Un fallo de ejecución (throw) se trata como reintentable y no propaga.
- [x] `normalizeCaptureSettings`: defaults y saneado de los dos campos nuevos.

> El binario nativo (COM + hardware) no entra en la suite unitaria: se cubre en la verificación
> manual/E2E de abajo.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 561 pasan
- [x] Comprobación manual con DualSense: con la opción activa, cada arranque de `obs64.exe` mutea el
      audio hacia el dispositivo DualSense y el zumbido deja de colarse. Verificado por el owner.
- [ ] Verificar en un **portable** empaquetado (instalación limpia) que el helper viaja dentro y
      funciona, y que la limpieza de temporales sigue borrando extracciones anteriores.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
