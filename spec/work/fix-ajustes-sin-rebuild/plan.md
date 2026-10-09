# Plan — Guardar ajustes que no afectan a la captura vaciaba el buffer

> **Este plan es un contrato.** Aprobado con el resto de la tanda B («arregla los 10»).

## Enfoque

1. `src/shared/capture.ts`: `PIPELINE_SETTING_KEYS` = exactamente las claves que `buildPipeline`,
   `captureProfile` y `effectiveCapture` leen (resolución, fps, calidad, bitrate, encoder,
   replaySeconds, micDeviceId, micVolume, supresión de ruido, modo de audio y volúmenes, audioApps,
   pistas separadas, monitor, escritorio y auto-switch, pistas de escritorio, outputDir, captura
   experimental, HDR, cursor, aspecto, ventana forzada y avanzada). `BUFFER_SETTING_KEYS` =
   `recordingMode`, `bufferMode`. `settingsChanged(prev, next, keys)` compara por valor (JSON para
   arrays/objetos).
2. `CaptureManager.setSettings`: `prev = store.load()` antes de guardar; después:
   - pipeline cambió → `pendingRebuild` si graba, `queueRebuild()` si no;
   - si no, buffer cambió → `queueTask(reconcileBuffer + setStatus)` si no graba;
   - siempre `applyMicMute()` (micEnabled/pttEnabled en caliente).
3. `index.ts` selftest: cada «rebuild» alterna `showMouseCursor` y al final lo restaura.

## Archivos / módulos afectados

- `src/shared/capture.ts`, `src/shared/__tests__/*capture*` (tests del catálogo).
- `src/main/capture/manager.ts`, `src/main/__tests__/capture-manager.test.ts`.
- `src/main/index.ts` (selftest).
- `spec/constitution/roadmap.md`.

## Decisiones y alternativas consideradas

- **Lista explícita de claves de pipeline** (elegida) frente a lista de «claves que NO afectan»: si
  alguien añade un ajuste nuevo y olvida la lista, el fallo es «no se reconstruye» (se nota al
  probar) y no «se vacía el buffer sin motivo» (silencioso). Un test cruza la lista con lo que
  `buildPipeline` lee de verdad, para que no se desincronicen.
- Alternativa mínima descartada: solo el atajo del overlay escribiendo en `settingsStore` directo
  (como las exclusiones): dejaría el mismo problema al guardar cualquier otra sección de Ajustes.

## Riesgos

- Olvidar una clave en la lista → un ajuste de captura no se aplica hasta el siguiente rebuild. Lo
  cubre el test que compara la lista con las claves leídas en `obs.ts`.

---

**Estado:** ✅ aprobado el 2026-10-08
