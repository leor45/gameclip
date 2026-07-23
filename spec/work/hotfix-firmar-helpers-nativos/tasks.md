# Tasks — Firmar helpers nativos

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. Mover `gc-app-audio-mute.exe` y `gc-controller-listen.exe` al filtro de carpeta en
     `electron-builder.yml` (quitar sus mapeos fichero-a-fichero). `gc-presentmon.exe` se queda
     aparte (ya viene firmado por Intel).

## Tests / verificación de firma (obligatorio para un cambio de empaquetado)

No hay test unitario razonable para «electron-builder firma este exe»: la prueba es una build
firmada real y medir la firma del paquete.

- [x] Build firmada con `gameclip-firma\2-firmar-y-compilar.ps1`.
- [x] `Get-AuthenticodeSignature` del paquete: `gc-app-audio-mute.exe` y `gc-controller-listen.exe`
      → `Valid CN=GameClip`.
- [x] Regresión: `obs64.exe`, `elevate.exe`, `gc-perf-sensors.exe` siguen `Valid CN=GameClip`;
      `gc-presentmon.exe` sigue `Valid CN=Intel Corporation`; el portable sigue firmado.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`)

## Cierre

- [x] Aprobación del owner
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
