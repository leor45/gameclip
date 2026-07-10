# Tasks — Esqueleto de la app (Fase 1)

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. Verificar la versión de Electron compatible con `obs-studio-node` actual y fijarla.
      → Electron **29.3.1** exacto (la que usa Streamlabs Desktop en producción, cuya build
      de osn se compila contra esa ABI; el paquete npm de osn está abandonado desde 2022 —
      se instala desde el S3 de Streamlabs, tarea de la Fase 3).
- [x] 2. `package.json` + dependencias + scripts; tooling base (TS, ESLint, Prettier, Vitest)
      con configs que pasan en verde sobre repo vacío.
- [x] 3. `src/shared/`: constantes IPC, tipos de payload, constante de puerto del server.
- [x] 4. `server/`: app Express exportable, ruta `/api/health`, `db/database.ts` con migración
      inicial (tabla `meta`) y `meta.repository.ts`.
- [x] 5. `src/main/`: ciclo de vida de Electron, BrowserWindow con `contextIsolation`,
      handler IPC `app:version`.
- [x] 6. `src/preload/`: bridge tipado `window.gameclip`.
- [x] 7. `src/renderer/`: shell con Sidebar + React Router y vistas placeholder
      (Biblioteca · Editor · Ajustes); mostrar versión vía IPC.
- [x] 8. `.gitignore` actualizado (server/data/; out/, dist/ y *.db ya estaban).

## Tests unitarios (obligatorios)

Camino feliz **y** casos borde.

- [x] shared — los nombres de canales IPC son únicos y siguen el formato `dominio:acción`.
- [x] server — `GET /api/health` responde 200 con shape correcto (supertest) + 404 en ruta desconocida.
- [x] server — la migración crea la tabla `meta` y es idempotente al reabrir la base (caso borde).
- [x] server — `MetaRepository`: upsert sobreescribe y `get` de clave inexistente devuelve undefined.
- [x] renderer — `App` renderiza la navegación, arranca en Biblioteca, navega a Ajustes y
      muestra la versión obtenida por IPC (Testing Library, 3 tests).

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 11 tests, 4 archivos
- [x] Comprobación manual: `npm run dev` abre la ventana con las 3 vistas navegables y
      `v0.1.0 · Electron 29.3.1` visible vía IPC (verificado con captura de pantalla);
      `npm run dev:server` responde `{status:'ok', version:'0.1.0', schemaVersion:'1'}` en
      `/api/health` y crea `server/data/gameclip.db` solo.

## Cierre

- [x] Aprobación del owner (delegada al agente para esta sesión — ver plan.md)
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
