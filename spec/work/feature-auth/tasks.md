# Tasks — Autenticación (Fase 2)

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. Dependencias (`bcrypt`, `jsonwebtoken` + types) y migración v2 (users, refresh_tokens).
- [x] 2. Repositorios `users` y `refresh_tokens`.
- [x] 3. `auth.service.ts` (register/login/refresh/logout/verifyAccess) + middleware Bearer.
- [x] 4. Rutas `/api/auth/*` con validación de entrada y montaje en `app.ts`.
- [x] 5. Tipos compartidos en `src/shared/auth.ts`.
- [x] 6. Cliente `api.ts` (Bearer + refresh automático) y `AuthContext` con persistencia.
- [x] 7. Pantallas Login/Registro + `AuthGate`; logout en Sidebar; CSP actualizada.

## Tests unitarios (obligatorios)

- [x] server — registro: éxito, email inválido (400), contraseña corta (400), duplicado (409, case-insensitive).
- [x] server — login: éxito, contraseña errónea (401), email inexistente (401, mismo mensaje).
- [x] server — `me`: con token válido (200), sin token (401), token corrupto (401).
- [x] server — refresh: rota el token (el viejo → 401 al reusarse), token desconocido → 401.
- [x] server — logout revoca el refresh token.
- [x] renderer — sin sesión se muestra Login; con sesión persistida se muestra el shell.
- [x] renderer — login exitoso guarda sesión y entra al shell; error de credenciales se muestra;
      cambio login↔registro; logout limpia sesión y vuelve al login.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 30 tests, 6 archivos
- [x] Comprobación manual: registro, login, `me` y contraseña errónea (401) contra el server
      real por API; migración v1→v2 aplicada sobre la base existente; pantalla de login
      renderizando en la app real (captura). Nota: el submit end-to-end desde la UI no se
      automatizó porque el owner estaba usando la máquina; el flujo UI queda cubierto por los
      6 tests de renderer con fetch mockeado.

## Cierre

- [x] Aprobación del owner (delegada esta sesión)
- [x] Merge a `main` con `--no-ff` y rama borrada
- [x] `spec/constitution/roadmap.md` actualizado
