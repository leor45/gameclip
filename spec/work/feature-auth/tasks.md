# Tasks — Autenticación (Fase 2)

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [ ] 1. Dependencias (`bcrypt`, `jsonwebtoken` + types) y migración v2 (users, refresh_tokens).
- [ ] 2. Repositorios `users` y `refresh_tokens`.
- [ ] 3. `auth.service.ts` (register/login/refresh/logout/verifyAccess) + middleware Bearer.
- [ ] 4. Rutas `/api/auth/*` con validación de entrada y montaje en `app.ts`.
- [ ] 5. Tipos compartidos en `src/shared/auth.ts`.
- [ ] 6. Cliente `api.ts` (Bearer + refresh automático) y `AuthContext` con persistencia.
- [ ] 7. Pantallas Login/Registro + `AuthGate`; logout en Sidebar; CSP actualizada.

## Tests unitarios (obligatorios)

- [ ] server — registro: éxito, email inválido (400), contraseña corta (400), duplicado (409).
- [ ] server — login: éxito, contraseña errónea (401), email inexistente (401).
- [ ] server — `me`: con token válido (200), sin token (401), token corrupto (401).
- [ ] server — refresh: rota el token (el viejo deja de servir), revocado → 401.
- [ ] server — logout revoca el refresh token.
- [ ] renderer — sin sesión se muestra Login; con sesión persistida se muestra el shell.
- [ ] renderer — login exitoso guarda sesión y entra al shell; error de credenciales se muestra.

## Verificación (gates)

- [ ] Type-check verde (`npm run typecheck`)
- [ ] Lint verde (`npm run lint`)
- [ ] Tests verdes (`npm run test`)
- [ ] Comprobación manual: registro + login reales contra el server, sesión persiste al
      reabrir la app, logout funciona.

## Cierre

- [ ] Aprobación del owner (delegada esta sesión)
- [ ] Merge a `main` con `--no-ff` y rama borrada
- [ ] `spec/constitution/roadmap.md` actualizado
