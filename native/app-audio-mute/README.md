# gc-app-audio-mute

Helper nativo de Windows (Core Audio) que silencia la sesión de audio de un proceso en los
dispositivos de salida cuyo nombre contenga un patrón. GameClip lo usa para mutear `obs64.exe` en el
DualSense y que la vibración háptica —que el mando transporta como audio— no se cuele en la
grabación. Ver `spec/work/feature-silenciar-haptico-dualsense`.

## Contrato (CLI)

```
gc-app-audio-mute.exe --device "DualSense" --process "obs64.exe" [--mute|--unmute|--watch]
```

- `--device <patrón>` — substring del *friendly name* del dispositivo de render (case-insensitive).
- `--process <exe>` — basename del ejecutable cuya sesión mutear (p. ej. `obs64.exe`).
- `--mute` (por defecto) / `--unmute` — modo **un disparo**: silenciar o reactivar y salir.
- `--watch` — modo **persistente event-driven** (ver abajo).

### Modo un disparo (`--mute`/`--unmute`)

Enumera, aplica `ISimpleAudioVolume::SetMute` y sale. Códigos de salida:

| Código | Significado |
|---|---|
| 0 | aplicado a al menos una sesión |
| 2 | ningún dispositivo coincide con el patrón |
| 3 | hay dispositivo(s) pero ninguna sesión del proceso |
| 1 | error de COM / argumentos faltantes |

### Modo watch (`--watch`)

Persistente: registra `IAudioSessionNotification` (mutea la sesión de `--process` **en cuanto**
`OnSessionCreated` dispara — clave porque en el DualSense la sesión no se crea hasta que el mando
emite audio) e `IMMNotificationClient` (re-escanea al conectarse un mando nuevo). Mutea también lo
ya existente al arrancar. **Bloquea leyendo stdin**: cuando el padre cierra el pipe (o muere) llega
EOF, desregistra y sale (sin proceso huérfano). Siempre devuelve 0. Event-driven: en reposo no
consume CPU. No escribe en disco.

## Compilar

Con las **Build Tools de Visual Studio** (o el "Developer Command Prompt"), desde la raíz del repo:

```
./scripts/build-haptic-mute.ps1
```

Deja el binario en `resources/gc-app-audio-mute.exe` (CRT estático `/MT`, sin runtime externo).
Ese `.exe` se commitea como artefacto reproducible y electron-builder lo empaqueta en el portable
vía `extraResources`.
