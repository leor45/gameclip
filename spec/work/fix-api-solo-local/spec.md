# Spec — La API de cuentas escucha en toda la red con un secreto público

**Tipo:** Fix (seguridad)
**Rama:** `fix/api-solo-local`
**Fecha:** 2026-10-08

## Problema / Objetivo

La API de autenticación que el main levanta embebida (puerto 3030) es accesible **desde cualquier
equipo de la red** y firma sus tokens con un secreto que está en el código fuente.

### Causa raíz (auditoría bug-hunter 2026-10-08, BUG-16 · CWE-798 · STRIDE: Spoofing)

- `server/api.ts` hace `createApp(db).listen(port, …)` **sin host**: Node enlaza la dirección no
  especificada (`::` / `0.0.0.0`), es decir, todas las interfaces. `server/app.ts` además abre CORS a
  cualquier origen.
- `server/auth/auth.service.ts`: `JWT_SECRET = process.env.GAMECLIP_JWT_SECRET ?? 'gameclip-dev-secret'`,
  y la app empaquetada nunca define la variable → el secreto efectivo es el literal público.

Consecuencia: desde la LAN (si el Firewall de Windows lo dejó pasar) cualquiera puede firmar un access
token válido para cualquier `userId` (`/api/auth/me` devuelve email y nombre) y probar contraseñas en
`/api/auth/login` sin límite. Hoy el impacto es acotado (solo `/auth/me` está protegida), pero crecería
con cada ruta autenticada nueva.

**Objetivo:** que la API solo sea alcanzable desde el propio PC y que cada instalación firme con su
propio secreto aleatorio.

## Alcance

**Dentro:**
- La API escucha solo en `127.0.0.1`; el renderer le habla a `http://127.0.0.1:3030` (y la CSP lo
  permite).
- Empaquetada, la app genera en el primer arranque un secreto aleatorio, lo guarda en `userData` y lo
  pasa a la API; las siguientes ejecuciones lo reutilizan.
- `AuthService` recibe el secreto por constructor (sin global de módulo). `dev:server` usa
  `GAMECLIP_JWT_SECRET` o el secreto de desarrollo (solo es alcanzable en local).

**Fuera (explícito):**
- Rate limit del login: con la API solo en local, el atacante tendría que estar ya en el PC.
- Rotar el secreto o invalidar sesiones existentes: los refresh tokens viven en la DB y siguen
  valiendo; los access tokens viejos (15 min) dejan de validar, que es lo esperado.

## Criterios de aceptación

- [ ] La API no responde desde otra IP del equipo (solo en `127.0.0.1`).
- [ ] Login, registro y sesión persistida siguen funcionando en la app empaquetada y en dev.
- [ ] Un token firmado con `gameclip-dev-secret` no lo acepta la app empaquetada.
- [ ] El secreto se crea una vez y sobrevive al reinicio.
