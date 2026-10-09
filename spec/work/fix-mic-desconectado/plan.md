# Plan — Un micrófono guardado que ya no existe deja el mic mudo y la UI lo enmascara

> **Este plan es un contrato.** Aprobado con el resto de la tanda B («arregla los 10»).

## Enfoque

1. `src/shared/capture.ts`: `resolveMicDevice(micDeviceId, devices: AudioDeviceInfo[])` →
   `{ deviceId, missing }`. Lo comparten main (fallback) y renderer (aviso), así los dos dicen lo
   mismo.
2. `src/main/capture/obs.ts`: en `buildAudioSources`, `const mic = resolveMicDevice(settings.micDeviceId,
   this.enumerateAudioDevices(osn))`; `enumerateAudioDevices(osn)` es la lógica de `getAudioDevices`
   parametrizada por el módulo osn (para que el fake de los tests pueda inyectar dispositivos). Si
   `missing`, `console.warn` con el id.
3. `src/renderer/views/ajustes/Audio.tsx`: con `missing`, una `<option disabled>` con el id huérfano
   seleccionada y un `settings-warning` debajo del select.

## Archivos / módulos afectados

- `src/shared/capture.ts` (+ `src/shared/__tests__/capture.test.ts`)
- `src/main/capture/obs.ts` (+ `src/main/__tests__/obs-helpers.test.ts`)
- `src/renderer/views/ajustes/Audio.tsx` (+ `src/renderer/__tests__/ajustes.test.tsx`)
- `spec/constitution/roadmap.md`

## Decisiones y alternativas consideradas

- **Fallback a `default` solo con enumeración no vacía:** si osn no pudo enumerar, degradar a ciegas
  podría cambiar el micro de alguien que sí lo tiene bien; se respeta el id.
- **Sin campo nuevo en `CaptureStatus`:** el aviso vive donde el usuario va a mirar (Ajustes → Audio) y
  no obliga a tocar el contrato IPC.

## Riesgos

- `getAudioDevices` crea una fuente temporal en libobs; ya se hacía al abrir Ajustes, ahora también en
  cada rebuild (coste despreciable, misma llamada).

---

**Estado:** ✅ aprobado el 2026-10-08
