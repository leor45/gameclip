# Tasks — Grabaciones en negro y sin audio

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. Test de regresión de `resolveMonitorId` (rojo) con los datos reales del probe.
- [x] 2. Test de regresión de `use_device_timing: false` en el audio de escritorio (rojo).
- [x] 3. `resolveMonitorId()` + settings de escritorio en `obs.ts` (verde).
- [x] 4. `CaptureEnvironment` con display completo (`{width, height, x, y}`) y cableado en
       `manager.ts` / `index.ts`.
- [x] 5. Retirar el probe temporal (`debugMonitorProperties`, modo `probe-monitors`).
- [x] 6. Método WGC fijo en `monitorCaptureSettings()` (causa 1b, descubierta en la E2E:
       DXGI entrega frames negros sin error en esta máquina).
- [x] 7. Bisect con repros mínimos fuera de la app (causa raíz 3 real): el setter
       `Input.volume` de osn silencia la fuente; hipótesis NVIDIA/escena/canal/dispositivo
       refutadas por repro controlado (matriz en el spec).
- [x] 8. Test de regresión (rojo): `buildAudioSources` no usa el setter `volume` y ata un
       fader por fuente con la deflection correcta.
- [x] 9. Volumen por `FaderFactory` en mic, escritorio y capturas por proceso; `volume`
       eliminado del tipado `OsnInput`; faders con detach/destroy en el teardown (verde).
- [x] 10. Retirar los probes temporales del diagnóstico (volmeter en `obs.ts`,
       `GAMECLIP_DEBUG_NO_BUFFER` en `manager.ts`).

## Tests unitarios (obligatorios)

Camino feliz **y** casos borde. Si es un Fix: el test de regresión va primero (rojo → verde).

- [x] `resolveMonitorId`: elige MO27Q28G por tamaño+posición (datos reales del bug).
- [x] `resolveMonitorId`: match por posición sola cuando el tamaño no cuadra (DPI raro).
- [x] `resolveMonitorId`: match por tamaño único; ambiguo (dos monitores iguales) → posición
       decide o `Auto`.
- [x] `resolveMonitorId`: sin items / nombres no parseables → `Auto`.
- [x] Settings de `wasapi_output_capture` (principal y fallback) llevan
       `use_device_timing: false`.
- [x] `monitorCaptureSettings`: método WGC siempre y sin la key legacy `monitor`.
- [x] `buildAudioSources` (fake de osn): cero llamadas al setter `volume`; un fader por
       fuente (mic + escritorio) con deflection 1 al 100 %.
- [x] `faderDeflection`: clamp 0..100 → 0..1 y valores no finitos → 1.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 241 tests, 32 archivos
- [x] Comprobación manual (E2E máquina real, selftest de grabación):
      - Video: log de libobs `display: MO27Q28G (2560x1440)` + `method: WGC` +
        `setting_id` = device id resuelto; `blackdetect` sin ningún intervalo negro
        (3 pasadas consecutivas; antes del fix: negro el 100 % del clip).
      - Audio: tono de 440 Hz por altavoces capturado en la pista 1 a −22.6 dB de media
        (max 0 dB) y cero avisos de `audio is lagging` (antes: −91 dB y descarte total).
      - Audio (adenda — causa raíz 3 del spec): el silencio reapareció de forma
        consistente; el diagnóstico completo está en el spec. Interferencia externa
        (stack NVIDIA App/ShadowPlay/Virtual Audio instalado el 2026-07-07) que silencia
        el loopback de TODA la familia libobs — OBS Studio 31.1.1 incluido — mientras el
        WASAPI crudo captura bien en los mismos dispositivos. Pendiente de acción del
        owner: deshabilitar Instant Replay/overlay de la NVIDIA App (o el dispositivo
        "NVIDIA Virtual Audio Device (Wave Extensible)" en el Administrador de
        dispositivos), reiniciar y reprobar la grabación con audio.

## Cierre

- [x] Aprobación del owner (delegada en esta sesión)
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
