# Plan — Captura de escritorio vs captura de juego

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Introducir un **perfil de captura** (`'game' | 'desktop' | 'none'`) como función pura de
(ajustes, ¿hay juego?), y derivar de él la escena y el audio. El perfil es la única pieza nueva de
lógica; el resto es cablearlo.

1. **Helper puro** en `src/shared/capture.ts`:

   ```ts
   export type CaptureProfile = 'game' | 'desktop' | 'none';

   export function captureProfile(s: CaptureSettings, gameDetected: boolean): CaptureProfile {
     if (!s.desktopRecordingEnabled) return gameDetected ? 'game' : 'none';
     if (gameDetected && s.desktopAutoSwitchToGame) return 'game';
     return 'desktop';
   }
   ```

2. **Ajustes efectivos** (helper puro en `obs.ts`, junto a `audioTrackLayout`):

   ```ts
   export function effectiveCapture(s, gameExe: string | null): {
     profile: CaptureProfile;
     video: 'monitor' | 'game' | 'none';
     audioMode: AudioMode;        // perfil desktop → siempre 'desktop'
     separateTracks: boolean;     // perfil desktop → desktopAudioTracks === 'separate'
   }
   ```

   En perfil `desktop` el audio se fuerza a `audioMode: 'desktop'` (una sola fuente
   `wasapi_output_capture` = todo el PC) y las pistas las decide `desktopAudioTracks`. El layout
   ya existente `desktop + separadas` (T1 mezcla, T2 mic) cubre exactamente la opción "PC y micro
   por separado", y `desktop + no separadas` la de "todo junto"; `audioTrackLayout()` no cambia.
   En perfil `game` se pasan los ajustes del usuario tal cual (modo `apps`, apps, pistas por rol).

3. **`buildPipeline()`** (`obs.ts`) deja de apilar capas: crea **una sola** fuente de vídeo según
   `video` — `monitor_capture` (perfil desktop), `game_capture` (perfil game) o ninguna (perfil
   `none`). Así "solo el juego" es determinista y no depende de que la capa de game capture
   enganche por encima del monitor.
   En perfil `game`, si conocemos el ejecutable detectado el `game_capture` va en modo `window`
   (`window: '::<exe>'`, `priority: 2`), que engancha también en ventana sin bordes; sin
   ejecutable, `any_fullscreen` como hoy.

4. **`CaptureManager`**: recordar el perfil con el que se construyó el pipeline
   (`this.builtProfile`). En `applyActiveGame()`, si el perfil cambia:
   - si no hay grabación en curso → `rebuildPipeline()`;
   - si la hay → marcar `pendingRebuild = true` y reconstruir al terminar (`stopRecording()` /
     `stopSessionRecording()`). Nunca se corta un clip a medias.
   El religado en caliente del audio del juego (`updateGameAudioTarget`) se conserva para los
   cambios de juego **dentro** del mismo perfil.

5. **Perfil `none`**: `shouldBuffer()` devuelve `false`; `startRecording()` y `saveReplay()` salen
   con `error: 'Sin juego detectado y con la grabación de escritorio desactivada no hay nada que
   capturar.'` (visible en la barra/estado como cualquier otro error de captura).

## Archivos / módulos afectados

- `src/shared/capture.ts` — dos claves nuevas en `CaptureSettings` (`desktopRecordingEnabled: boolean`
  con default `true`; `desktopAudioTracks: 'mixed' | 'separate'` con default `'mixed'`), sus defaults
  y su normalización; nuevo `captureProfile()` y tipo `CaptureProfile`.
- `src/main/capture/obs.ts` — nuevo `effectiveCapture()`; `buildPipeline()` crea una única fuente de
  vídeo según el perfil; `buildAudioSources()` usa el modo/pistas efectivos en vez de los crudos;
  `gameSettings()` acepta el modo de captura (`window` cuando hay exe).
- `src/main/capture/manager.ts` — `builtProfile` + `pendingRebuild`; rebuild por cambio de perfil en
  `applyActiveGame()`; aplazamiento del rebuild mientras se graba; `shouldBuffer()` y los guards de
  `startRecording()` / `saveReplay()` para el perfil `none`.
- `src/renderer/views/ajustes/Grabacion.tsx` — en el fieldset "Grabación de escritorio": checkbox
  maestro "Grabar el escritorio", radio "Audio del clip de escritorio" (todo junto / PC y micro en
  pistas separadas), y deshabilitar los controles hijos (monitor, auto-switch, audio) cuando el
  maestro está apagado.
- `src/renderer/views/ajustes/Audio.tsx` — nota corta bajo "Audio a grabar": el audio por aplicación
  y las pistas separadas solo aplican a las capturas de juego.
- `package.json` — versión `0.1.0` → `0.2.0`.
- Tests: `src/shared/__tests__/capture.test.ts`, `src/main/__tests__/obs-helpers.test.ts`,
  `src/main/__tests__/capture-manager.test.ts`, `src/renderer/__tests__/grabacion.test.tsx`.

## Decisiones y alternativas consideradas

- **Una sola fuente de vídeo por perfil**, en vez de apilar `game_capture` sobre `monitor_capture` y
  dejar que libobs decida. Lo actual es justo lo que falla: si la capa de juego no engancha, sale el
  escritorio. Con una sola fuente el resultado es determinista (a cambio: si el game capture no
  engancha, el clip sale negro en vez de mostrar el escritorio — que es lo que el usuario pidió).
- **Rebuild al cambiar de perfil**, en vez de alternar la visibilidad de los items de escena. La
  visibilidad resolvería el vídeo sin perder el replay buffer, pero **el audio también cambia** entre
  perfiles (fuentes distintas y bitmask de pistas distinto en las salidas), y eso no se puede
  reasignar en caliente de forma segura. Coste asumido: al aparecer/desaparecer un juego el replay
  buffer se reinicia (se pierden los segundos previos del buffer, no un clip en curso).
- **Ajuste propio `desktopAudioTracks`** en la sección Escritorio, en vez de reutilizar
  `separateAudioTracks`: así el usuario puede tener pistas por rol en el juego y una sola pista en el
  escritorio, que es exactamente lo pedido.
- **Versión `0.2.0`** (minor): comportamiento nuevo visible, sin ruptura de datos ni de ajustes
  (los ajustes viejos normalizan a los nuevos defaults).

## Riesgos

- **Clip negro en perfil `game`** si `game_capture` no engancha el proceso (juegos raros, permisos).
  Mitigación: modo `window` con el ejecutable detectado, que es el más fiable; y la vía de escape es
  desmarcar el auto-switch (se graba el monitor).
- **Replay buffer reiniciado al lanzar/cerrar un juego.** Es inherente al rebuild; en la práctica el
  buffer del escritorio previo no interesa cuando acabas de entrar al juego.
- **Rebuild aplazado**: hay que asegurar que se dispara en *todas* las salidas de `recording`
  (stop manual, stop de sesión en modo auto, error) o el pipeline se quedaría con el perfil viejo.
  Se cubre con tests en `capture-manager.test.ts`.
- **`forceWindowCapture` queda redundante** en perfil `game` (ya se usa modo `window` cuando hay exe).
  No se toca en esta tarea; queda anotado para una limpieza posterior.

---

**Estado:** ⏳ pendiente de aprobación
