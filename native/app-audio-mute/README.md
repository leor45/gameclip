# gc-app-audio-mute

Helper nativo de Windows (Core Audio) que silencia la sesión de audio de un proceso en los
dispositivos de salida cuyo nombre contenga un patrón. GameClip lo usa para mutear `obs64.exe` en el
DualSense y que la vibración háptica —que el mando transporta como audio— no se cuele en la
grabación. Ver `spec/work/feature-silenciar-haptico-dualsense`.

## Contrato (CLI)

```
gc-app-audio-mute.exe --device "DualSense" --process "obs64.exe" [--mute|--unmute]
```

- `--device <patrón>` — substring del *friendly name* del dispositivo de render (case-insensitive).
- `--process <exe>` — basename del ejecutable cuya sesión mutear (p. ej. `obs64.exe`).
- `--mute` (por defecto) / `--unmute` — silenciar o reactivar.

Códigos de salida:

| Código | Significado |
|---|---|
| 0 | aplicado a al menos una sesión |
| 2 | ningún dispositivo coincide con el patrón |
| 3 | hay dispositivo(s) pero ninguna sesión del proceso |
| 1 | error de COM / argumentos faltantes |

No escribe en disco: enumera, aplica `ISimpleAudioVolume::SetMute` y sale. Efímero por diseño.

## Compilar

Con las **Build Tools de Visual Studio** (o el "Developer Command Prompt"), desde la raíz del repo:

```
./scripts/build-haptic-mute.ps1
```

Deja el binario en `resources/gc-app-audio-mute.exe` (CRT estático `/MT`, sin runtime externo).
Ese `.exe` se commitea como artefacto reproducible y electron-builder lo empaqueta en el portable
vía `extraResources`.
