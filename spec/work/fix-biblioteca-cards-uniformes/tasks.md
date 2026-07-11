# Tasks — Biblioteca: cards uniformes con preview en `contain`

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. Test de regresión de la regla `.clip-thumb img` (rojo).
- [x] 2. Regla CSS: imagen absoluta + `object-fit: contain` (verde).

## Tests unitarios (obligatorios)

Camino feliz **y** casos borde. Si es un Fix: el test de regresión va primero (rojo → verde).

- [x] `.clip-thumb img` con `position: absolute` + `inset: 0` + `object-fit: contain`.
- [x] `.clip-thumb` conserva `aspect-ratio: 16/9` y `position: relative`.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 236 tests, 33 archivos
- [x] Comprobación manual: app real vía CDP con 18 clips mezclados (16 de 16:9 y 2 de
      9:16): los 18 `.clip-thumb` midieron exactamente 303x170; `object-fit: contain` y
      `position: absolute` computados; screenshot del grid uniforme.

## Cierre

- [x] Aprobación del owner (delegada en esta sesión)
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
