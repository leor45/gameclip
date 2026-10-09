# Plan — Un email enorme congela la app y los errores de la API filtran rutas del PC

> **Este plan es un contrato.** Aprobado con el resto de la tanda D.

## Enfoque

1. `src/shared/auth.ts`: `isValidEmail` = `email.length <= 254 && EMAIL_RE.test(email)`. La regex no
   cambia; acotada a 254 caracteres su peor caso es ~0,05 ms (medido).
2. `server/app.ts`: `express.json({ limit: '16kb' })`.
3. `server/app.ts`: `apiErrorHandler` (cuatro parámetros, registrado **después** de los routers):
   - respuesta ya empezada (`res.headersSent`) → `next(err)`: el manejador de Express solo corta la
     conexión, sin escribir nada;
   - `type` `entity.parse.failed` → 400 «El cuerpo de la petición no es JSON válido.»;
     `entity.too.large` → 413 «El cuerpo de la petición es demasiado grande.»;
   - otro error con `status` (o, si no sirve, `statusCode`) entero 400-499 → ese status, «Petición no
     válida.»;
   - cualquier otra cosa → 500 «Error interno.» y `console.error` con el detalle.

## Archivos / módulos afectados

- `src/shared/auth.ts` (+ `src/shared/__tests__/auth.test.ts`)
- `server/app.ts` (+ `server/__tests__/errores.test.ts`)
- `spec/constitution/roadmap.md`

## Decisiones y alternativas consideradas

- **Límite de largo antes de la regex** frente a reescribir la regex sin retroceso: la regex se queda
  idéntica, así que con largo válido no cambia nada; el límite además es el de RFC 5321.
- **`.length` (unidades UTF-16) frente a octetos:** un email nunca ocupa menos octetos en UTF-8 que
  unidades UTF-16, así que el límite nunca rechaza una dirección que RFC 5321 admita.
- **Sin validar el email en el login:** no corre ninguna regex (solo una búsqueda en SQLite), y validar
  dejaría fuera a quien se registró antes con un email de más de 254 caracteres.
- **16 kB:** la petición legítima más grande (registro) pesa menos de 1 kB; el límite deja margen para
  contraseñas largas.
- **Mensajes genéricos en español** en vez de `err.message` de body-parser (en inglés y con trozos del
  cuerpo): el renderer ya muestra `body.error` tal cual.
- **`console.error` solo en el 500:** el manejador de Express registraba todos los errores en consola;
  se conserva para los inesperados (los 4xx son errores del cliente y solo serían ruido).
- **`headersSent` → `next(err)`:** es el patrón de Express; su manejador, con la respuesta empezada, no
  escribe nada (destruye el socket), así que no hay fuga. Las rutas actuales responden en una sola
  llamada, así que en la práctica no ocurre.
- **CORS:** `cors()` pone sus cabeceras antes de `express.json()` y el manejador no las quita.
- **Exportar `apiErrorHandler`:** para probar con una respuesta falsa los casos que no se pueden
  provocar desde fuera (respuesta ya empezada, valores lanzados que no son `Error`).

## Riesgos

- Una petición legítima de más de 16 kB recibiría 413: ninguna ruta actual se acerca.
- Express reconoce el manejador de errores por tener cuatro parámetros: comprobado que el bundle del
  main (`electron-vite build`) conserva `function apiErrorHandler(err, _req, res, next)`.

---

**Estado:** ✅ aprobado el 2026-10-09
