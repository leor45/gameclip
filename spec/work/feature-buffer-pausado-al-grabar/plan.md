# Plan — El buffer de repetición se pausa durante la grabación manual

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Todo en `CaptureManager`; libobs y `ObsCapture` no cambian.

1. `doStartRecording`: si `bufferRunning`, parar el buffer **antes** de `obs.startRecording()`. Se
   hace a pelo (`obs.stopReplayBuffer()` + `bufferRunning = false`) y no con `stopBuffer()`, porque
   este llama a `syncOverlayProtection()` con el estado aún en `buffering` y desprotegería el overlay
   unos frames justo antes de que arranque la grabación. `syncOverlayProtection(true)` ya se llama
   antes y mantiene la protección.
2. Al parar: nada nuevo. `settleAfterRecording` → `reconcileBuffer` ya arranca el buffer si
   `shouldBuffer()` y no corre. Si durante la grabación cambió el perfil, `rebuildPipeline` también
   lo arranca.
3. `doSaveReplay`: si `state === 'recording'` y el buffer no corre, emitir `replay-skipped` y salir sin
   tocar libobs. `index.ts` lo conecta a `overlay.showToast('Ya estás grabando')`. Cubre el atajo, el
   botón del mando y el IPC, porque todos pasan por `saveReplay`.
4. `startSessionRecording` (modo auto) no se toca: sigue arrancando el buffer si hace falta.

## Archivos / módulos afectados

- `src/main/capture/manager.ts` — `doStartRecording`, `doSaveReplay`, evento `replay-skipped`.
- `src/main/index.ts` — toast del overlay para `replay-skipped`; el selftest con `_CLIP=1` espera que
  el clip durante la grabación no se guarde.
- `src/main/__tests__/capture-manager.test.ts` — tests nuevos.
- `spec/constitution/roadmap.md`.

## Decisiones y alternativas consideradas

- **Parar el buffer solo en la grabación manual** (elegida) frente a también en la sesión del modo
  auto (descartada: ahí el replay marca jugadas durante una grabación larga).
- **Avisar con un toast** frente a ignorar en silencio (descartada: el usuario pulsa y no sabría por
  qué no hay clip) o a dejar el error de libobs (descartada: no es un error).
- **Reutilizar `reconcileBuffer`** para rearrancar en vez de un arranque explícito al parar: ya existe y
  decide bien en todos los casos (juego abierto/cerrado durante la grabación, modo `game`).

## Riesgos

- Justo después de parar una grabación el buffer está vacío: durante los primeros `replaySeconds` el
  replay será más corto de lo configurado. Es inherente a pararlo; se anota en el roadmap.
- Un error al parar el buffer no debe impedir grabar: va dentro del `try` existente, que deja el error
  en el status.

---

**Estado:** ✅ aprobado el 2026-10-08 (el owner confirmó «solo manual» y «aviso si pulsas replay grabando»)
