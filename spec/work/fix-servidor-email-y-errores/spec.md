# Spec — Un email enorme congela la app y los errores de la API filtran rutas del PC

**Tipo:** Fix (seguridad, Low)
**Rama:** `fix/servidor-email-y-errores`
**Fecha:** 2026-10-09

## Problema / Objetivo

Auditoría bug-hunter D, dos hallazgos Low de la API de cuentas (Express embebido en el main de
Electron, en `127.0.0.1`).

- **D2-BUG-1 (CWE-1333) — un email enorme congela el main.** Registrarse con un email como
  `'a@' + '.'.repeat(N) + ' '` bloquea el proceso main (y con él la captura, los atajos y la UI) durante
  segundos: 20 ms con 5 000 caracteres, 330 ms con 20 000, ~3 s con 60 000, ~8 s con ~100 kB (medido).
  **Causa raíz:** `isValidEmail` (`src/shared/auth.ts`) corre `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` sin límite
  de largo; con un dominio de puntos que no termina bien, la regex prueba cada punto como separador y
  retrocede en tiempo cuadrático. `register()` valida el email lo primero, y `express.json()` acepta
  cuerpos de hasta 100 kB por defecto.
- **D2-BUG-2 (CWE-209) — los errores devuelven el stack.** Un cuerpo JSON mal formado o por encima del
  límite responde con el stack completo en HTML: rutas absolutas con el usuario de Windows y la carpeta
  temporal del portable (comprobado: `at parse (D:\Projects\gameclip\node_modules\body-parser\…)`).
  **Causa raíz:** `createApp` no tiene manejador de errores, así que responde el de Express
  (`finalhandler`), que manda `err.stack` salvo con `NODE_ENV=production`; la app empaquetada nunca lo
  define (Express va externalizado por electron-vite y lee `process.env.NODE_ENV` en runtime, que cae a
  `'development'`).

## Alcance

**Dentro:**
- `isValidEmail` rechaza más de 254 caracteres (máximo de RFC 5321) **antes** de la regex; con largo
  válido el resultado es el mismo de siempre.
- `express.json({ limit: '16kb' })`: las peticiones de la API pesan menos de 1 kB.
- Manejador final de errores en `createApp`: responde `{ error }` en JSON (la forma del resto de la API)
  y nunca el stack — JSON mal formado → 400, cuerpo demasiado grande → 413, otro error con status 4xx →
  ese status, cualquier otro → 500 `{ error: 'Error interno.' }`.
- Tests de regresión.

**Fuera (explícito):**
- **Login, refresh y `/auth/me`:** no corren la regex ni otra expresión sobre lo que manda el usuario
  (comprobado); el login no valida el formato del email a propósito, para no dejar fuera a nadie
  registrado antes con un email raro. Con el límite de 16 kB, su coste queda acotado.
- `maxLength` en los campos del formulario o límite de largo del nombre para mostrar.
- Respuesta JSON para el 404 de rutas inexistentes (no lleva stack: «Cannot GET /api/…»).

## Criterios de aceptación

- [ ] `isValidEmail('a@' + '.'.repeat(60000) + ' ')` devuelve `false` al instante (antes ~3 s).
- [ ] Un email de 255 caracteres se rechaza y uno de 254 se acepta; los emails normales dan lo mismo
      que antes.
- [ ] JSON mal formado → 400 `{ error }` en JSON, sin stack ni rutas; con las cabeceras CORS.
- [ ] Cuerpo de más de 16 kB → 413 `{ error }` en JSON; uno de 15 kB se procesa con normalidad.
- [ ] Un error inesperado en una ruta → 500 `{ error: 'Error interno.' }`, sin stack.
- [ ] Preflight CORS y resto de la API sin cambios; suite verde.
