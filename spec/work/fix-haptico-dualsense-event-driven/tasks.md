# Tasks — Silenciado del háptico del DualSense guiado por eventos

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

### Native (helper `--watch`)

- [x] 1. `native/app-audio-mute/main.cpp` — refactor: extraer el matcheo de proceso/dispositivo y el
       mute a helpers reutilizables por el modo un-disparo y el modo watch.
- [x] 2. `IAudioSessionNotification`: clase con `OnSessionCreated` que mutea la sesión de `obs64.exe`.
       Registrar por dispositivo con `RegisterSessionNotification` + `GetSessionEnumerator` (quirk) y
       mutear las sesiones existentes.
- [x] 3. `IMMNotificationClient`: ante `OnDeviceAdded`/`OnDeviceStateChanged`, re-escaneo idempotente
       de endpoints de render activos que matcheen el patrón (mapa `deviceId → watch` con mutex).
- [x] 4. Bucle principal de `--watch`: registrar todo, mutear lo existente, bloquear leyendo stdin;
       al EOF, desregistrar, liberar y salir. Sin bomba de mensajes (MTA).
- [x] 5. `native/app-audio-mute/README.md` — documentar `--watch`.

### GameClip (TS)

- [x] 6. `src/main/capture/app-audio-mute.ts` — `HapticMuteListener`: `apply(enabled, pattern)`
       idempotente (spawn `--watch` / kill / restart) y `stop()`. `spawn` inyectable. Mantener
       `buildArgs` para el modo watch. Quitar `applyHapticMute`/reintento.
- [x] 7. `src/main/capture/manager.ts` — quitar `reapplyHapticMute` y sus 3 llamadas; añadir el
       listener (inyectable) y llamarlo en `initialize()` y `setSettings()`; `stop()` en `shutdown()`.

## Tests unitarios (obligatorios)

`src/main/__tests__/app-audio-mute.test.ts` — reescrito, con `spawn` mockeado:

- [x] `buildArgs` arma la CLI de watch (device, process, `--watch`).
- [x] `apply(true, patrón)` spawnea el listener con los args correctos.
- [x] `apply` repetido con el mismo estado no respawnea (idempotente).
- [x] Cambiar el patrón reinicia (kill + spawn nuevo).
- [x] `apply(false, …)` mata el proceso; `stop()` también.
- [x] Sin binario (helperPath null): no-op, no spawnea.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`)
- [ ] Comprobación manual (owner): arrancar juego, no tocar el mando, luego pulsar un botón → el
      háptico se mutea solo (sin reabrir Ajustes). Conectar un mando en plena partida → también.
      Desactivar la opción / cerrar la app → el listener muere (sin proceso huérfano).

## Cierre

- [ ] Aprobación del owner (tras la prueba manual)
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
