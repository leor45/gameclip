# Spec — CORS en la API del server

**Tipo:** Fix
**Rama:** `fix/cors-api`
**Fecha:** 2026-07-11

## Problema / Objetivo

El renderer en dev (Vite, `http://localhost:5173`) no puede llamar a la API
(`http://localhost:3030/api/*`): el navegador bloquea el preflight con
`No 'Access-Control-Allow-Origin' header is present on the requested resource`.

**Causa raíz:** `createApp()` (`server/app.ts`) nunca registra un middleware CORS, así que
Express no responde las peticiones `OPTIONS` de preflight ni añade `Access-Control-Allow-Origin`
a ninguna respuesta. El bug existe desde la Fase 1 (esqueleto del server) pero se manifestó al
consumir la API desde el renderer (Fase 2, login/registro).

## Alcance

**Dentro:**
- Habilitar CORS en la API para cualquier origen (API local sin cookies; la autenticación va
  por header `Authorization`, no por credenciales de navegador).
- Responder correctamente el preflight `OPTIONS` (métodos y headers solicitados).
- Test de regresión que reproduce el bloqueo (preflight sin cabeceras) primero en rojo.

**Fuera (explícito):**
- Lista blanca de orígenes configurable (no aporta con un server 100 % local).
- Cambios en el renderer o en el flujo de auth.

## Criterios de aceptación

- [x] Un `OPTIONS /api/auth/register` con `Origin` y `Access-Control-Request-Method: POST`
      responde 2xx con `Access-Control-Allow-Origin` y los headers pedidos permitidos.
- [x] Las respuestas normales de la API incluyen `Access-Control-Allow-Origin`.
- [x] El registro desde el renderer en dev (`http://localhost:5173`) deja de fallar por CORS.
- [x] Gates verdes (type-check · lint · tests).
