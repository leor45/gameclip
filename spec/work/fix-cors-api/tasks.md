# Tasks — CORS en la API del server

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. Test de regresión `server/__tests__/cors.test.ts` (preflight y cabecera) — **rojo**.
- [x] 2. Instalar `cors` + `@types/cors`.
- [x] 3. Registrar `app.use(cors())` en `server/app.ts` — test **verde**.

## Tests unitarios (obligatorios)

Camino feliz **y** casos borde. Si es un Fix: el test de regresión va primero (rojo → verde).

- [x] Preflight `OPTIONS /api/auth/register` responde 2xx con `Access-Control-Allow-Origin`
      y permite el header `Authorization` solicitado.
- [x] Una respuesta normal (`GET /api/health` con `Origin`) incluye `Access-Control-Allow-Origin`.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`)
- [x] Comprobación manual: preflight real contra el server (`OPTIONS /api/health` → 204 con
      `Access-Control-Allow-Origin: *`).

## Cierre

- [x] Aprobación del owner (delegada para esta sesión)
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado (nota del fix)
