# Tasks — Un email enorme congela la app y los errores de la API filtran rutas del PC

## Tests unitarios (obligatorios; primero, en rojo)

- [x] Regresión (D2-BUG-1): `isValidEmail('a@' + '.'.repeat(60000) + ' ')` es `false` en menos de
      200 ms (antes 2 949 ms).
- [x] Regresión (D2-BUG-1): un email de 255 caracteres se rechaza y uno de 254 se acepta; tabla de
      emails normales con el mismo resultado de siempre.
- [x] Regresión (D2-BUG-1): el registro con un email de más de 254 caracteres responde 400 (antes 201).
- [x] Regresión (D2-BUG-2): JSON mal formado → 400 `{ error }` en JSON, sin stack, rutas ni
      `node_modules` (antes HTML con el stack); con las cabeceras CORS.
- [x] Regresión (D2-BUG-2): charset no soportado → 415 `{ error }` sin stack (antes HTML con el stack).
- [x] Regresión: cuerpo de 17 kB → 413 `{ error }` en JSON (antes se aceptaba); uno de 15 kB se procesa.
- [x] Regresión (D2-BUG-2): error lanzado en una ruta (mock de `AuthService.logout` y un
      `refreshToken` real que no se puede convertir a texto) → 500 `{ error: 'Error interno.' }`, sin
      stack y con el detalle en consola.
- [x] `apiErrorHandler`: con la respuesta empezada delega en Express sin escribir; status 4xx por
      `status` o `statusCode`; 5xx, fuera de rango, no entero, no numérico o valor no objeto → 500.

## Implementación

- [x] 1. `isValidEmail`: límite de 254 caracteres antes de la regex.
- [x] 2. `express.json({ limit: '16kb' })`.
- [x] 3. `apiErrorHandler` como último middleware de `createApp`.

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes (85 archivos, 1087 tests)
- [x] Comprobación real (2026-10-09) con `NODE_ENV` sin definir, como en la app empaquetada: JSON mal
      formado y cuerpo de 120 kB responden `{"error":"…"}` en JSON (antes HTML con el stack y rutas
      `D:\Projects\gameclip\node_modules\…`).
- [x] El bundle del main conserva los cuatro parámetros de `apiErrorHandler`.

## Cierre

- [x] Aprobación del owner
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
