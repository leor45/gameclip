# Tasks — Audio avanzado (PTT, supresión de ruido, lista estilo de las apps de clips) + Development Mode

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [ ] 1. Instalar `uiohook-napi` y verificar que carga en el main de Electron.
- [ ] 2. Modelo compartido: `enabled` en `audioApps`, `pttEnabled`/`pttHotkey`/
       `noiseSuppressionEnabled`/`hardwareAcceleration`, `DEFAULT_AUDIO_APPS`, mapeo de teclas.
- [ ] 3. `push-to-talk.ts` con require falible + canal `capture:get-ptt-available`.
- [ ] 4. `obs.ts`: setMicMuted, filtro de ruido, solo apps enabled; `manager.ts`: setMicHeld.
- [ ] 5. `index.ts`: hw accel antes de ready (store único) + wiring PTT.
- [ ] 6. UI: Audio rediseñada (filas fijas + checkbox + basurero rojo, PTT, supresión) y
       sección Desarrollo nueva.

## Tests unitarios (obligatorios)

- [ ] Normalización: campos nuevos; `audioApps` viejos migran a `enabled: true`.
- [ ] `push-to-talk`: mapeo hotkey→keycode (teclas y Mouse4/5, inválidas → null); emisión de
       'held' con hook fake (keydown/keyup del keycode correcto, ignora otros).
- [ ] `capture-manager`: setMicHeld ↔ mute según micEnabled/pttEnabled; el mute se recalcula
       tras rebuild.
- [ ] UI: filas fijas presentes en modo apps (Discord sin correr), checkbox desactiva sin
       quitar, basurero quita, PTT/supresión/hw-accel se guardan.

## Verificación (gates)

- [ ] Type-check verde (`npm run typecheck`)
- [ ] Lint verde (`npm run lint`)
- [ ] Tests verdes (`npm run test`)
- [ ] Comprobación manual: selftest con supresión de ruido activa + modo apps con Discord
       enabled (pipeline construye y graba); arranque con `hardwareAcceleration: false` no rompe.

## Cierre

- [ ] Aprobación del plan (delegada); revisión final del owner sobre el resultado.
- [ ] Merge a `main` (tras `feature/settings-avanzados`) solo cuando el owner lo pida.
- [ ] `spec/constitution/roadmap.md` actualizado.
