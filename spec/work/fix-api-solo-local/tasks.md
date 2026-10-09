# Tasks — La API de cuentas escucha en toda la red con un secreto público

## Tests de regresión (primero, en rojo)

- [ ] `startApi` escucha en `127.0.0.1` (el `address()` del server).
- [ ] `AuthService` con un secreto inyectado rechaza un token firmado con `gameclip-dev-secret`.
- [ ] `loadOrCreateSecret`: crea uno si no existe, reutiliza el existente, regenera si está vacío.
- [ ] CSP: `connect-src` permite `http://127.0.0.1:3030`.

## Implementación

- [ ] 1. `SERVER_HOST` / `SERVER_URL` y CSP.
- [ ] 2. `listen` con host.
- [ ] 3. Secreto inyectado en `AuthService` / `createApp` / `startApi`.
- [ ] 4. `jwt-secret.ts` y cableado en el main y en `dev:server`.

## Verificación (gates)

- [ ] Type-check verde (`npm run typecheck`)
- [ ] Lint verde (`npm run lint`)
- [ ] Tests verdes (`npm run test`)
- [ ] Comprobación manual: `npm run dev` + `npm run dev:server` → login funciona; `Get-NetTCPConnection -LocalPort 3030` muestra `127.0.0.1`.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
