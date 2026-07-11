# Tasks — Audio avanzado (PTT, supresión de ruido, lista estilo de las apps de clips) + Development Mode

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. Instalar `uiohook-napi` y verificar que carga en el main de Electron.
- [x] 2. Modelo compartido: `enabled` en `audioApps`, `pttEnabled`/`pttHotkey`/
       `noiseSuppressionEnabled`/`hardwareAcceleration`, `DEFAULT_AUDIO_APPS`, mapeo de teclas.
- [x] 3. `push-to-talk.ts` con require falible + canal `capture:get-ptt-available`.
- [x] 4. `obs.ts`: setMicMuted, filtro de ruido, solo apps enabled; `manager.ts`: setMicHeld.
- [x] 5. `index.ts`: hw accel antes de ready (store único) + wiring PTT.
- [x] 6. UI: Audio rediseñada (filas fijas + checkbox + basurero rojo, PTT, supresión) y
       sección Desarrollo nueva.

## Tests unitarios (obligatorios)

- [x] Normalización: campos nuevos; `audioApps` viejos migran a `enabled: true`.
- [x] `push-to-talk`: mapeo hotkey→keycode (teclas y Mouse4/5, inválidas → null); emisión de
       'held' con hook fake (keydown/keyup del keycode correcto, ignora otros, mouse 4/5,
       desactivar detiene el hook).
- [x] `capture-manager`: setMicHeld ↔ mute según micEnabled/pttEnabled; el mute se recalcula
       tras rebuild.
- [x] UI: filas fijas presentes en modo apps (Discord sin correr), checkbox desactiva sin
       quitar, basurero quita, PTT/supresión/hw-accel se guardan, aviso si el hook no está.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 27 archivos / 191 tests
- [x] Comprobación manual: selftest real con supresión de ruido + PTT + modo apps
       (Discord enabled, Spotify disabled) → MP4 720p60 ~10 Mbps con 3 pistas AAC separadas
       (juego/mic/apps), sin errores; arranque con `hardwareAcceleration: false` loguea la
       desactivación y graba igual. Ajustes del usuario respaldados y restaurados.

## Cierre

- [x] Aprobación del plan (delegada por el owner en esta sesión).
- [x] Merge a `main` (tras `feature/settings-avanzados`) — autorizado por el owner en esta sesión.
- [x] `spec/constitution/roadmap.md` actualizado.
