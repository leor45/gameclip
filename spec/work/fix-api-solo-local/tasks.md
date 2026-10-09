# Tasks — La API de cuentas escucha en toda la red con un secreto público

## Tests de regresión (primero, en rojo)

- [x] `startApi` escucha en `127.0.0.1` (el `address()` del server).
- [x] `AuthService` con un secreto inyectado rechaza un token firmado con `gameclip-dev-secret`.
- [x] `loadOrCreateSecret`: crea uno si no existe, reutiliza el existente, regenera si está vacío.
- [x] CSP: `connect-src` permite `http://127.0.0.1:3030`.

## Implementación

- [x] 1. `SERVER_HOST` / `SERVER_URL` y CSP.
- [x] 2. `listen` con host.
- [x] 3. Secreto inyectado en `AuthService` / `createApp` / `startApi`.
- [x] 4. `jwt-secret.ts` y cableado en el main y en `dev:server`.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`)
- [x] Comprobación manual: `npm run dev` + `npm run dev:server` → login funciona; `Get-NetTCPConnection -LocalPort 3030` muestra `127.0.0.1`.

## Cierre

- [x] Aprobación del owner
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
