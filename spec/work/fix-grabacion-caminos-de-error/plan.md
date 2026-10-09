# Plan — Los caminos de error de la grabación dejan el buffer y el estado desincronizados

> **Este plan es un contrato.** Aprobado con el resto de la tanda B («arregla los 10»).

## Enfoque

Todo en `src/main/capture/manager.ts`, sin tocar `ObsCapture`:

1. Helper privado `recoverAfterRecordingError()`: `sessionGameName = undefined`, luego
   `await this.settleAfterRecording()` dentro de su propio `try/catch` (si la reconciliación también
   falla, se conserva el error original y el estado real). Lo usan los `catch` de `doStartRecording`
   y `doStopRecording`, que después fijan `state: bufferRunning ? 'buffering' : 'idle'`.
2. `rebuildPipeline`: mover `this.bufferRunning = false` antes de `obs.buildPipeline()`; envolver la
   llamada: si lanza, `pendingRebuild = true`, `builtProfile = null`, `setStatus({ state: 'idle' })` y
   relanzar (queueTask pone el error en el status).
3. `reconcileBuffer`: si `pendingRebuild`, reconstruir en vez de arrancar/parar salidas que no
   existen. `applyActiveGame`: la rama de reconstrucción se entra también con `pendingRebuild`.

## Archivos / módulos afectados

- `src/main/capture/manager.ts`
- `src/main/__tests__/capture-manager.test.ts` (3 tests de regresión)
- `spec/constitution/roadmap.md`

## Decisiones y alternativas consideradas

- **Reconciliar en el catch** (elegida) frente a «dejar el buffer vivo al grabar» (volver atrás la
  feature): la feature es deseada; lo que faltaba era cubrir sus caminos de error.
- **`pendingRebuild` tras un build fallido** frente a reintentar el build en el acto: reintentar en
  caliente podría encadenar fallos de libobs; con la marca, el siguiente evento lo recupera.

## Riesgos

- Si `stopRecording` rechazó por timeout, libobs puede seguir grabando. Arrancar el buffer en ese
  estado es seguro (encoders separados desde `fix/grabacion-espera-keyframe`).

---

**Estado:** ✅ aprobado el 2026-10-08
