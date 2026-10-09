# Plan — Ajustes que se pierden o se pisan

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

### Main — `CaptureManager.setSettings`

```ts
if (this.obs.isInitialized) {
  if (this.status.state === 'recording') this.pendingRebuild = true;
  else await this.queueRebuild();
}
```
`settleAfterRecording` ya honra `pendingRebuild`, así que no hace falta más.

### Renderer — `useCaptureSettings`

- Un `ref` con el conjunto de claves **editadas** (`set` añade la clave).
- `save()` manda solo `{ [clave]: settings[clave] }` de las editadas (si no hay ninguna, no llama al
  IPC), limpia el conjunto y adopta los ajustes normalizados que devuelve el main.
- Suscripción a `capture.onSettingsChanged`: actualiza los campos **no** editados con el valor que
  llega; los editados se respetan hasta guardar.

El IPC `CaptureSetSettings` ya fusiona el parcial sobre los ajustes actuales, así que un parcial es
suficiente y no cambia de contrato.

## Archivos / módulos afectados

- `src/main/capture/manager.ts` — rebuild pendiente.
- `src/renderer/views/ajustes/useCaptureSettings.ts` — guardado por diferencias + suscripción.
- `src/main/__tests__/capture-manager.test.ts`, `src/renderer/__tests__/ajustes.test.tsx` — regresiones.

## Decisiones y alternativas consideradas

- **Guardar solo lo tocado** frente a «recargar antes de guardar»: recargar seguiría pisando lo que
  cambie entre la recarga y el guardado, y además descartaría ediciones locales.
- **Granularidad por clave de primer nivel** — suficiente para los casos reales; `perfOverlay`
  (objeto) solo se edita en una sección.

## Riesgos

- Una sección que dependiera de reenviar campos no tocados (para normalizarlos) dejaría de hacerlo:
  el main ya normaliza el conjunto al fusionar, así que no cambia el resultado.

---

**Estado:** ✅ aprobado el 2026-10-08 (auto-aprobado por indicación del owner, con los 9 planes de la auditoría listos)
