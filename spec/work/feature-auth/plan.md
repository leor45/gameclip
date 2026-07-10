# Plan — Autenticación (Fase 2)

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Server primero (testeable con supertest sin UI), luego el cliente. El server gana una
migración v2 (`users`, `refresh_tokens`) y un módulo `auth/` con servicio + rutas; los JWT se
firman con un secreto de `process.env.GAMECLIP_JWT_SECRET` (default de dev). Los refresh
tokens son opacos (aleatorios), se guardan **hasheados** (sha256) con expiración y revocación,
y se **rotan** en cada refresh.

En el renderer, un `AuthContext` gestiona la sesión: `localStorage` para persistir
`{user, accessToken, refreshToken}`, un cliente HTTP (`api.ts`) que añade el Bearer y ante un
401 intenta un refresh único y reintenta. `App` decide: sin sesión → `AuthGate`
(Login/Registro); con sesión → shell actual. Logout en el sidebar.

## Archivos / módulos afectados

- `package.json` — + `bcrypt`, `jsonwebtoken`, `@types/bcrypt`, `@types/jsonwebtoken`.
- `server/db/database.ts` — migración v2 (users, refresh_tokens).
- `server/db/users.repository.ts` · `server/db/refresh-tokens.repository.ts` — nuevos.
- `server/auth/auth.service.ts` — register/login/refresh/logout/verifyAccess (lógica pura,
  testeable sin HTTP).
- `server/auth/auth.middleware.ts` — Bearer → `req.userId`.
- `server/routes/auth.ts` — rutas HTTP; validación de entrada.
- `server/app.ts` — montar rutas auth.
- `src/shared/auth.ts` — tipos compartidos (User, AuthTokens, payloads) usados por renderer.
- `src/renderer/lib/api.ts` — fetch wrapper con Bearer + refresh automático.
- `src/renderer/auth/AuthContext.tsx` · `src/renderer/auth/AuthGate.tsx` ·
  `src/renderer/auth/Login.tsx` · `src/renderer/auth/Registro.tsx` — nuevos.
- `src/renderer/App.tsx` · `components/Sidebar.tsx` — integración de sesión y logout.
- `src/renderer/index.html` — CSP: `connect-src 'self' http://localhost:3030`.
- Tests: `server/__tests__/auth.test.ts` (flujos completos vía supertest),
  `src/renderer/__tests__/auth.test.tsx` (login/registro/gate con fetch mockeado).

## Decisiones y alternativas consideradas

- **Refresh token opaco + hash en DB con rotación** — descartado JWT de refresh sin estado:
  sin estado no se puede revocar (logout real) ni detectar reuso.
- **`bcrypt` nativo** (constitution) con costo 10 — descartado `bcryptjs` (más lento en JS
  puro); bcrypt trae prebuilds para win-x64/Node 22.
- **Persistencia en `localStorage` del renderer** — descartado `safeStorage` en main por
  ahora: la app es local y el server es localhost; se documenta como mejora si algún día los
  tokens dan acceso a la nube. Mantiene la Fase 2 sin nueva superficie IPC.
- **Validación manual de entrada (helpers propios)** — descartado zod/express-validator:
  dos campos no justifican una dependencia nueva.

## Riesgos

- `bcrypt` sin prebuild para el Node local obligaría a compilar; mitigación: si falla el
  install, cambiar a `bcryptjs` (API compatible) y documentarlo.
- El renderer llama a `localhost:3030`: si el server no corre, la UI debe mostrar error de
  conexión claro en login/registro (se cubre en la pantalla, no silencioso).

---

**Estado:** ✅ aprobado el 2026-07-10 (aprobación delegada por el owner al agente para esta sesión)
