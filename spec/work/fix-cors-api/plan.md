# Plan — CORS en la API del server

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Usar el middleware estándar `cors` de Express con configuración por defecto (origen `*`,
refleja `Access-Control-Request-Headers`, responde el preflight con 204). La API es local y
sin cookies — los tokens viajan por header `Authorization`, compatible con `*` — así que no
hace falta lista blanca.

Test de regresión primero: preflight `OPTIONS /api/auth/register` con supertest debe devolver
las cabeceras CORS (rojo sin el fix, verde con él).

## Archivos / módulos afectados

- `package.json` — dependencias `cors` y `@types/cors`.
- `server/app.ts` — `app.use(cors())` antes de las rutas.
- `server/__tests__/cors.test.ts` — test de regresión (preflight + cabecera en respuesta normal).

## Decisiones y alternativas consideradas

- **Paquete `cors`** — alternativa: middleware a mano (~10 líneas). Se descarta por reinventar
  un estándar bien testeado; el paquete no pesa y cubre preflight/headers/métodos sin errores sutiles.
- **Origen `*`** — alternativa: whitelist (`localhost:5173` + `null` del `file://` empaquetado).
  Se descarta: el server solo escucha en localhost y no usa cookies; la whitelist añade fricción
  (origen `null` del renderer empaquetado, puertos alternativos de Vite) sin ganancia de seguridad real.

## Riesgos

- Ninguno relevante: el cambio es aditivo y no toca lógica de negocio. Si algún día la API se
  expone fuera de localhost con cookies, habrá que revisar el origen (queda anotado en el spec).

---

**Estado:** ✅ aprobado el 2026-07-11 (aprobación delegada por el owner para esta sesión)
