# Plan — Firmar helpers nativos

> Hotfix: por convención se rige por el `spec.md`. Esta nota resume el enfoque.

## Enfoque

Mover `gc-app-audio-mute.exe` y `gc-controller-listen.exe` del mapeo `extraResources`
fichero-a-fichero (que electron-builder no firma) al mapeo de carpeta con filtro que ya usa
`gc-perf-sensors.exe` (que sí queda firmado al empaquetar). Un solo punto de firma: el empaquetado.

## Archivos / módulos afectados

- `electron-builder.yml` — los dos helpers pasan al bloque `from: resources / to: . / filter`.

## Decisiones y alternativas consideradas

- Filtro de carpeta vs. firmar en `scripts/build-*.ps1` — se descarta autofirmar en los scripts de
  build: la firma de release vive en el empaquetado (un certificado, un punto), no en cada helper.
- `gc-presentmon.exe` se deja aparte: ya viene firmado por Intel; no se re-firma.

## Riesgos

- Ninguno funcional: el destino de los exe (`resources/`, `process.resourcesPath`) no cambia. La
  prueba real es una build firmada + `Get-AuthenticodeSignature` sobre el paquete.

---

**Estado:** ✅ aprobado el 2026-07-22
