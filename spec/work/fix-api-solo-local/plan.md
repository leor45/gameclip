# Plan — La API de cuentas escucha en toda la red con un secreto público

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

1. **Solo local.** `src/shared/config.ts`: `SERVER_HOST = '127.0.0.1'` y
   `SERVER_URL = http://127.0.0.1:3030`. `server/api.ts`: `listen(port, options.host ?? SERVER_HOST)`.
   CSP de `src/renderer/index.html`: `connect-src … http://127.0.0.1:3030` (en vez de `localhost`).
   Se usa la IP y no `localhost` porque `localhost` puede resolver a `::1` y quedar fuera del enlace.
2. **Secreto por instalación.** Nuevo `server/auth/jwt-secret.ts`:
   `loadOrCreateSecret(file, deps)` — lee el fichero; si no existe o está vacío, genera
   `randomBytes(48).toString('hex')`, lo escribe y lo devuelve. El main lo llama con
   `userData/api-secret` y pasa `jwtSecret` a `startApi` → `createApp(db, secret)` →
   `new AuthService(db, secret)`.
3. `server/index.ts` (dev) pasa `process.env.GAMECLIP_JWT_SECRET ?? DEV_JWT_SECRET`.

## Archivos / módulos afectados

- `src/shared/config.ts`, `src/renderer/index.html` — host y CSP.
- `server/api.ts`, `server/app.ts`, `server/auth/auth.service.ts`, `server/index.ts` — host y secreto inyectado.
- `server/auth/jwt-secret.ts` (nuevo), `src/main/index.ts` — secreto persistido.
- Tests: `server/__tests__/auth.test.ts` (y los que construyan `createApp`), nuevo test de
  `jwt-secret`, `src/renderer/__tests__/csp.test.ts`, test de `startApi` escuchando en `127.0.0.1`.

## Decisiones y alternativas consideradas

- **Fichero en `userData`** frente a guardarlo en la propia DB: el fichero se puede borrar para rotar
  sin tocar los usuarios, y no mezcla configuración con datos.
- **Sin rate limit** — con el enlace solo local deja de ser una superficie remota (ver spec).

## Riesgos

- Si algo del renderer usara `localhost:3030` literal, fallaría la CSP: se busca y se cambia todo a
  `SERVER_URL`.

---

**Estado:** ⏳ pendiente de aprobación
