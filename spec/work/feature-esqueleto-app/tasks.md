# Tasks — Esqueleto de la app (Fase 1)

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [ ] 1. Verificar la versión de Electron compatible con `obs-studio-node` actual y fijarla.
- [ ] 2. `package.json` + dependencias + scripts; tooling base (TS, ESLint, Prettier, Vitest)
      con configs que pasan en verde sobre repo vacío.
- [ ] 3. `src/shared/`: constantes IPC, tipos de payload, constante de puerto del server.
- [ ] 4. `server/`: app Express exportable, ruta `/api/health`, `db/database.ts` con migración
      inicial (tabla `meta`) y `meta.repository.ts`.
- [ ] 5. `src/main/`: ciclo de vida de Electron, BrowserWindow con `contextIsolation`,
      handler IPC `app:version`.
- [ ] 6. `src/preload/`: bridge tipado `window.gameclip`.
- [ ] 7. `src/renderer/`: shell con Sidebar + React Router y vistas placeholder
      (Biblioteca · Editor · Ajustes); mostrar versión vía IPC.
- [ ] 8. `.gitignore` actualizado (out/, dist/, server/data/*.db).

## Tests unitarios (obligatorios)

Camino feliz **y** casos borde.

- [ ] shared — los nombres de canales IPC son únicos y los tipos compilan (test de contrato).
- [ ] server — `GET /api/health` responde 200 con shape correcto (supertest).
- [ ] server — la migración crea la tabla `meta` y es idempotente al reabrir la base (caso borde).
- [ ] renderer — `App` renderiza la navegación y cambia de vista al navegar (Testing Library).

## Verificación (gates)

- [ ] Type-check verde (`npm run typecheck`)
- [ ] Lint verde (`npm run lint`)
- [ ] Tests verdes (`npm run test`)
- [ ] Comprobación manual: `npm run dev` abre la ventana con las 3 vistas navegables y la
      versión visible; `npm run dev:server` responde en `/api/health`.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
