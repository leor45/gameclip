# Tasks — Reproductor interno (CSP + mezcla en pista 1)

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. Reproducir el fallo: harness limpio (funciona) vs app real vía CDP (falla) →
       aislar el CSP como causa; matriz de privilegios para descartar el scheme.
- [x] 2. Test de regresión del CSP (rojo) → fix en index.html (verde) → verificación en vivo.
- [x] 3. Test de regresión de audioTrackPlan (rojo) → pista 1 = mezcla en obs.ts (verde).
- [x] 4. `media-protocol.ts` con privilegios documentados y testeados.

## Tests unitarios (obligatorios)

- [x] `csp.test.ts`: media-src e img-src permiten gameclip-media: (regresión, rojo→verde).
- [x] `obs-helpers.test.ts`: audioTrackPlan — sin separar todo a pista 1; con separar
       mic=1+2 y apps=1+3; toda máscara incluye la pista 1 (regresión).
- [x] `media-protocol.test.ts`: privilegios secure+stream del scheme.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 196 tests
- [x] Comprobación manual: sonda CDP sobre la app real → `canplay` del clip y miniatura OK;
       selftest de grabación con tracks separados sigue produciendo MP4 multipista.

## Cierre

- [x] Aprobación del owner
- [x] Merge a `main` con `--no-ff` y rama borrada — cuando el owner lo pida
- [x] `spec/constitution/roadmap.md` actualizado (nota de fix post-entrega; el commit de la
       nota viajó en la rama apilada `feature/config-grabacion`)
