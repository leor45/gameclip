# Spec — Firmar gc-app-audio-mute y gc-controller-listen en el empaquetado

**Tipo:** Hotfix (solo config de empaquetado)
**Rama:** `hotfix/firmar-helpers-nativos`
**Fecha:** 2026-07-22

## Problema / Causa raíz

En la build firmada (release 0.9.2, compilada con `gameclip-firma\2-firmar-y-compilar.ps1`), dos
helpers nativos viajan **sin firma Authenticode**: `gc-app-audio-mute.exe` (mute del háptico del
DualSense en la sesión de obs64) y `gc-controller-listen.exe` (botón de captura de mandos). El resto
del paquete —`obs64.exe`, `elevate.exe`, `gc-perf-sensors.exe`— sí queda firmado con `CN=GameClip`.

**Causa raíz medida (2026-07-22):** en `electron-builder.yml`, esos dos helpers se declaran como
`extraResources` con **mapeo fichero-a-fichero** (`from: resources/x.exe` → `to: x.exe`), y
electron-builder **no firma** ese tipo de entrada. `gc-perf-sensors.exe`, en cambio, entra por un
**mapeo de carpeta con filtro** (`from: resources` → `to: .` + `filter`), y ese sí lo firma.
Comprobado por contraste: las tres fuentes en `resources/` están `NotSigned`, pero tras empaquetar
solo la que va por filtro de carpeta sale `Valid  CN=GameClip`. Ninguno de los `scripts/build-*.ps1`
autofirma; la firma la pone electron-builder al empaquetar. La verificación del 2026-07-19 solo miró
`obs64.exe`, por eso no se detectó antes.

**Impacto:** funcionalmente inocuo hoy (ninguno de los dos se inyecta en el proceso del juego con
anti-cheat, así que no causan clip negro), pero es una incoherencia de firma en el paquete: esos dos
exe salen como «editor desconocido» incluso para quien tiene el certificado instalado, con más
fricción potencial de SmartScreen/AV.

## Alcance

**Dentro:**
- Mover `gc-app-audio-mute.exe` y `gc-controller-listen.exe` al mismo mapeo de carpeta con filtro que
  ya firma `gc-perf-sensors.exe`, para que electron-builder los firme igual que al resto.

**Fuera (explícito):**
- Firmar en los `scripts/build-*.ps1`: la firma de release vive en el empaquetado (un solo
  certificado, un solo punto), no en el build del helper. No se toca esa separación.
- Cualquier cambio en `gameclip-firma\2-firmar-y-compilar.ps1` (fuera del repo, correcto tal cual).

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] Tras una build **firmada**, `gc-app-audio-mute.exe` y `gc-controller-listen.exe` del paquete
      salen `Valid  CN=GameClip` (medido con `Get-AuthenticodeSignature`).
- [ ] El resto del paquete sigue firmado igual (`obs64.exe`, `elevate.exe`, `gc-perf-sensors.exe`) y
      `gc-presentmon.exe` mantiene su firma de Intel.
- [ ] Los dos helpers siguen llegando a `process.resourcesPath` con su nombre de siempre
      (`gc-app-audio-mute.exe`, `gc-controller-listen.exe`) — no cambia la ruta que espera el código.
- [ ] Gates verdes: typecheck · lint · tests.

## Nota de comportamiento (por qué es seguro)

Firmar con un certificado autofirmado **no cambia la ejecución** en equipos sin ese certificado
instalado: la firma sale como «editor desconocido», que a efectos de arranque equivale a no llevar
firma. Windows ejecuta por igual sin-firma, firma-no-confiable y firma-confiable (sin WDAC/AppLocker
de por medio). Hoy esos helpers ya arrancan sin firma en cualquier equipo; firmarlos solo puede dejar
ese caso igual o mejor, nunca peor. Ver memoria `build-firmado-anticheat`.
