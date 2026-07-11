# Tasks — Grabaciones en negro y sin audio

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [ ] 1. Test de regresión de `resolveMonitorId` (rojo) con los datos reales del probe.
- [ ] 2. Test de regresión de `use_device_timing: false` en el audio de escritorio (rojo).
- [ ] 3. `resolveMonitorId()` + settings de escritorio en `obs.ts` (verde).
- [ ] 4. `CaptureEnvironment` con display completo (`{width, height, x, y}`) y cableado en
       `manager.ts` / `index.ts`.
- [ ] 5. Retirar el probe temporal (`debugMonitorProperties`, modo `probe-monitors`).

## Tests unitarios (obligatorios)

Camino feliz **y** casos borde. Si es un Fix: el test de regresión va primero (rojo → verde).

- [ ] `resolveMonitorId`: elige MO27Q28G por tamaño+posición (datos reales del bug).
- [ ] `resolveMonitorId`: match por posición sola cuando el tamaño no cuadra (DPI raro).
- [ ] `resolveMonitorId`: match por tamaño único; ambiguo (dos monitores iguales) → posición
       decide o `Auto`.
- [ ] `resolveMonitorId`: sin items / nombres no parseables → `Auto`.
- [ ] Settings de `wasapi_output_capture` (principal y fallback) llevan
       `use_device_timing: false`.
- [ ] `monitorSettings` ya no lleva la key legacy `monitor`.

## Verificación (gates)

- [ ] Type-check verde (`npm run typecheck`)
- [ ] Lint verde (`npm run lint`)
- [ ] Tests verdes (`npm run test`)
- [ ] Comprobación manual (E2E máquina real): selftest de grabación con tono sonando y
      contenido en el monitor elegido → log de libobs muestra el display correcto;
      `blackdetect` no marca todo el clip; `volumedetect` > −60 dB en la pista 1.

## Cierre

- [ ] Aprobación del owner (delegada en esta sesión)
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
