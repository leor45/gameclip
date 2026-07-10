# Spec — Autenticación (Fase 2)

**Tipo:** Feature
**Rama:** `feature/auth`
**Fecha:** 2026-07-10

## Problema / Objetivo

GameClip necesita usuarios para asociar clips y preferencias (y en el futuro, la nube). Esta
fase implementa registro y login directo (email + contraseña) contra el server local, con
sesión persistente en la app: al reabrir GameClip el usuario sigue logueado hasta que cierre
sesión.

## Alcance

**Dentro:**
- Server: tabla `users` + tabla `refresh_tokens` (migración v2), repositorios, y rutas
  `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`,
  `POST /api/auth/logout`, `GET /api/auth/me`.
- Contraseñas con `bcrypt`; JWT access (corto) + refresh (largo, rotado y revocable,
  almacenado hasheado en la base).
- Renderer: pantallas de Login y Registro; la app completa queda detrás del login
  (sin sesión → pantalla de auth; con sesión → shell con sidebar).
- Sesión persistente entre reinicios de la app y botón de cerrar sesión en el sidebar.
- Refresh automático del access token cuando expira (reintento único ante 401).

**Fuera (explícito):**
- Login social (Discord/Google) — fuera del roadmap actual.
- Verificación de email, recuperación de contraseña, rate-limiting.
- Perfil de usuario editable (solo email + display name al registrarse).
- Cifrado del almacenamiento local de tokens (safeStorage) — se anota como mejora futura.

## Criterios de aceptación

- [ ] Registro con email inválido o contraseña < 8 caracteres responde 400 con mensaje claro.
- [ ] Registro con email ya usado responde 409.
- [ ] Login correcto devuelve access token, refresh token y datos del usuario; login con
      contraseña errónea responde 401.
- [ ] `GET /api/auth/me` con Bearer válido devuelve el usuario; sin token o con token
      inválido responde 401.
- [ ] `POST /api/auth/refresh` rota el refresh token (el anterior queda inválido) y devuelve
      un access token nuevo; un refresh revocado/expirado responde 401.
- [ ] `POST /api/auth/logout` revoca el refresh token.
- [ ] En la app: sin sesión se ve Login/Registro; tras login se ve el shell; al reabrir la
      app la sesión persiste; logout vuelve al login.
- [ ] Gates verdes: typecheck · lint · tests (incluyendo los flujos anteriores).
