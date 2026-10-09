# Spec — Los caminos de error de la grabación dejan el buffer y el estado desincronizados

**Tipo:** Fix
**Rama:** `fix/grabacion-caminos-de-error`
**Fecha:** 2026-10-08

## Problema / Objetivo

Tres caminos de error del `CaptureManager` (auditoría bug-hunter B, BUG-1, BUG-2 y BUG-3) dejan
`bufferRunning` y `status.state` sin corresponderse con lo que libobs tiene de verdad, y nada los
reconcilia hasta que cambia el juego o se guardan ajustes:

1. **BUG-1 (regresión de `feature/buffer-pausado-al-grabar`):** `doStartRecording` para el buffer y,
   si `obs.startRecording()` rechaza, el `catch` solo escribe `error`. Queda `state: 'buffering'`
   con el buffer parado; el atajo de replay pasa el guard y falla contra libobs.
2. **BUG-2 (misma regresión):** si `obs.stopRecording()` rechaza, el `catch` fija el estado desde
   `bufferRunning` (false) → `'idle'` aunque `shouldBuffer()` sea true; el replay no responde y
   `sessionGameName` queda sucio.
3. **BUG-3:** `rebuildPipeline` resetea `bufferRunning` **después** de `obs.buildPipeline()`, pero
   `buildPipeline` destruye las salidas en su primera línea; si lanza después, `bufferRunning` sigue
   en true con el buffer destruido, `reconcileBuffer` no lo arranca (o intenta pararlo y lanza) y el
   estado visible sigue `'buffering'`.

**Causa raíz común:** los caminos de error no pasan por la reconciliación del buffer
(`settleAfterRecording` / `reconcileBuffer`) ni dejan el pipeline marcado como pendiente de rebuild.

## Alcance

**Dentro:**
- `doStartRecording` y `doStopRecording`: en el `catch`, limpiar `sessionGameName`, reconciliar el
  buffer (best-effort) y fijar el estado según `bufferRunning` real.
- `rebuildPipeline`: `bufferRunning = false` antes de construir; si `buildPipeline` lanza, marcar
  `pendingRebuild = true`, estado `'idle'`, y que `reconcileBuffer`/`applyActiveGame` reconstruyan en
  la siguiente oportunidad en vez de tocar salidas que no existen.
- Tests de regresión (rojo → verde) para los tres caminos.

**Fuera (explícito):**
- Reintentos automáticos de libobs, timeouts de `waitForSignal`.
- Los demás hallazgos de la auditoría B (ramas propias).

## Criterios de aceptación

- [ ] Con `bufferMode: always`, si `startRecording` de libobs rechaza, el manager vuelve a
      `'buffering'` con el buffer corriendo y `saveReplay` funciona.
- [ ] Si `stopRecording` de libobs rechaza, el manager rearranca el buffer, queda en `'buffering'`,
      y una grabación posterior arranca con `sessionGameName` limpio.
- [ ] Si `buildPipeline` lanza en un rebuild, `bufferRunning` queda en false, el estado en `'idle'`
      con el error, y el siguiente rebuild (ajustes o juego) reconstruye y arranca el buffer.
- [ ] Suite verde: typecheck, lint, tests.
