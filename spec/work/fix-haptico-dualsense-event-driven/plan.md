# Plan — Silenciado del háptico del DualSense guiado por eventos

> **Este plan es un contrato.** Aprobado, el alcance queda fijo; lo nuevo lleva su propio spec/plan.

## Enfoque

Pasar de "reintento acotado en cada arranque de captura" a un **listener persistente event-driven**
que reacciona al evento real: la creación de la sesión de `obs64.exe` en el dispositivo del mando.

**Native (`gc-app-audio-mute.exe`, nuevo modo `--watch`):**

- Se conserva el modo de un disparo (`--mute`/`--unmute`) para tests/uso manual, y se añade
  `--watch`, que **no termina**: registra notificaciones y bloquea hasta que el padre lo cierra.
- `CoInitializeEx(MULTITHREADED)`: los callbacks de Core Audio llegan en hilos COM de fondo, sin
  necesidad de bomba de mensajes. El hilo principal bloquea leyendo `stdin`; cuando el padre cierra
  el pipe (o muere) llega EOF → desregistra y sale. Así no quedan procesos huérfanos.
- **Notificación de sesiones** por dispositivo: `IAudioSessionManager2::RegisterSessionNotification`
  con un `IAudioSessionNotification`. En `OnSessionCreated`, si el proceso de la sesión es
  `obs64.exe`, `ISimpleAudioVolume::SetMute(true)`. Tras registrar, se llama una vez a
  `GetSessionEnumerator` (quirk documentado de MSDN: sin ello `OnSessionCreated` no dispara) y de
  paso se mutean las sesiones ya existentes.
- **Notificación de dispositivos:** `IMMDeviceEnumerator::RegisterEndpointNotificationCallback` con
  un `IMMNotificationClient`. Ante cualquier `OnDeviceAdded`/`OnDeviceStateChanged`, **re-escaneo
  idempotente** de endpoints de render activos: registra el watch de sesiones en los que matcheen el
  patrón y aún no estén vigilados (mapa `deviceId → {manager, notif}` protegido por mutex). Simplifica
  frente a gestionar alta/baja fina de cada dispositivo.
- Matching de dispositivo por *friendly name* (substring, case-insensitive) y de proceso por basename,
  igual que hoy.

**GameClip (TS): ciclo de vida en vez de disparo por captura.**

- `app-audio-mute.ts` pasa a exponer un **`HapticMuteListener`** con estado:
  - `apply(enabled, devicePattern)` — idempotente: arranca el proceso `--watch` si debe estar activo
    y no lo está; lo mata si debe estar inactivo; lo reinicia si cambió el patrón. Compara estado
    deseado vs. actual, así se puede llamar en init y en cada cambio de ajustes sin duplicar procesos.
  - `stop()` — mata el proceso (cierre de la app).
  - Inyecta `spawn` para testear la máquina de estados sin lanzar nada real.
- `manager.ts`:
  - **Se elimina** `reapplyHapticMute()` y sus 3 llamadas (startBuffer, doStartRecording,
    startSessionRecording): el listener cubre la creación de sesión de forma continua.
  - Se guarda un `HapticMuteListener` (inyectable, default real). `apply(...)` se llama al final de
    `initialize()` y en `setSettings()` (con los valores nuevos); `stop()` en `shutdown()`.

## Archivos / módulos afectados

- `native/app-audio-mute/main.cpp` — añadir modo `--watch`: `IAudioSessionNotification`,
  `IMMNotificationClient`, re-escaneo, lectura de stdin para salir. Refactor a clases COM con
  conteo de referencias mínimo.
- `native/app-audio-mute/README.md` — documentar `--watch`.
- `src/main/capture/app-audio-mute.ts` — reemplazar la orquestación de un disparo (`applyHapticMute`
  + reintento) por `HapticMuteListener` (spawn persistente, máquina de estados). Se conserva
  `buildArgs` para el modo watch.
- `src/main/capture/manager.ts` — quitar `reapplyHapticMute` y sus llamadas; añadir el listener y
  su ciclo de vida (init/setSettings/shutdown).
- `src/main/__tests__/app-audio-mute.test.ts` — reescribir: tests de la máquina de estados del
  listener (mock de spawn) en vez de los del reintento.
- Empaquetado/build: **sin cambios** — mismo binario, mismo `resources/`, misma `extraResources`.

## Decisiones y alternativas consideradas

- **Listener persistente event-driven** vs. **sondeo periódico** mientras se graba — se elige el
  primero: latencia nula (mutea al crearse la sesión, antes de que suene el primer háptico) y CPU
  despreciable. El sondeo tendría ventana de fuga (el zumbido se colaría hasta el siguiente tick) y
  gastaría más. Queda como **plan B** solo si `OnSessionCreated` no dispara para este tipo de sesión.
- **Salir por EOF de stdin** vs. Job Object con kill-on-close — EOF de stdin es más simple y también
  evita orphans si el padre muere; sin complejidad de jobs en Node.
- **Re-escaneo idempotente ante eventos de dispositivo** vs. alta/baja fina por dispositivo — el
  re-escaneo es más simple y robusto; los eventos de dispositivo son raros, así que el coste es nulo.
- **Reutilizar el binario con `--watch`** vs. un binario nuevo — reutilizar: cero cambios de
  empaquetado y de rutas.
- **Dueño del listener = manager** (ya tiene ajustes + init/shutdown) vs. index.ts — el manager, por
  cohesión con los ajustes; inyectable para no spawnear en tests.

## Riesgos

- **`OnSessionCreated` podría no disparar para una sesión de loopback/captura** (comportamiento a
  confirmar en máquina real). Mitigación: el enumerado inicial + el quirk de `GetSessionEnumerator`;
  si aun así no llega, plan B (sondeo de baja frecuencia). Se valida en la prueba manual del owner.
- **Hilos:** los callbacks llegan en hilos COM; el mapa de dispositivos y el mute van con mutex y las
  operaciones son cortas. Un cuelgue en un callback bloquearía el servicio de audio: se mantienen
  triviales.
- **Vida del proceso:** hay que garantizar que el listener muere con GameClip. Cubierto por EOF de
  stdin + `kill()` explícito en `stop()`.
- **Regresión no unit-testeable:** el bug es de timing nativo/COM, no reproducible en la suite. La
  cobertura automática va sobre la **máquina de estados del listener** (TS); lo funcional se verifica
  a mano (OK del owner), como el resto de lo nativo/obs del proyecto.

---

**Estado:** ✅ aprobado el 2026-07-12 (autoaprobado por el agente a petición del owner)
