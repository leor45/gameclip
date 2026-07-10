# Plan — Esqueleto de la app (Fase 1)

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Scaffolding manual guiado por la plantilla de **electron-vite** (main/preload/renderer en un
build unificado), en lugar de un generador interactivo, para controlar exactamente qué entra al
repo. El server Express vive en `server/` y corre como proceso aparte en dev con `tsx watch`.
Un solo `package.json`; TypeScript estricto en todas las capas con un `tsconfig` por contexto
(node vs web) y `src/shared/` visible desde app y server.

Orden de construcción: tooling primero (TS/ESLint/Prettier/Vitest con configs mínimas que ya
pasan en verde) → shared → server → main/preload → renderer. Así cada capa se verifica con los
gates al momento de añadirla.

## Archivos / módulos afectados

- `package.json`, `package-lock.json` — dependencias y scripts (dev, dev:server, typecheck, lint, format, test, build).
- `electron.vite.config.ts` — build de main/preload/renderer.
- `tsconfig.json` + `tsconfig.node.json` + `tsconfig.web.json` — proyecto TS por contexto.
- `eslint.config.js`, `.prettierrc.json`, `.prettierignore` — lint/format.
- `vitest.config.ts` — dos entornos: node (main, server, shared) y jsdom (renderer).
- `src/shared/` — `ipc.ts` (nombres de canales + tipos de payload), `version.ts`.
- `src/main/` — `index.ts` (ciclo de vida, BrowserWindow), `ipc.ts` (handler `app:version`).
- `src/preload/index.ts` — `contextBridge.exposeInMainWorld('gameclip', …)` tipado.
- `src/renderer/` — `index.html`, `main.tsx`, `App.tsx`, `components/Sidebar.tsx`,
  `views/{Biblioteca,Editor,Ajustes}.tsx`, estilos base (CSS plano por ahora).
- `server/` — `index.ts` (bootstrap Express), `app.ts` (app exportable para tests),
  `routes/health.ts`, `db/database.ts` (apertura + migración), `db/meta.repository.ts`.
- Tests: `src/shared/__tests__/`, `server/__tests__/health.test.ts` (supertest),
  `src/renderer/__tests__/App.test.tsx` (Testing Library).
- `.gitignore` — añadir `out/`, `dist/`, `server/data/*.db`.

## Decisiones y alternativas consideradas

- **Electron: fijar la versión pensando en `obs-studio-node`.** La constitution manda que libobs
  dicta la versión de Electron. Antes de instalar, se consulta qué Electron soporta la release
  actual de `obs-studio-node` (registro npm / repo de Streamlabs) y se fija **exactamente esa
  major** en `package.json` (sin `^`). Alternativa descartada: usar el Electron más nuevo y
  migrar en Fase 3 — rebajar Electron después implica retestear todo el esqueleto.
- **electron-vite** — descartado Electron Forge + Vite plugin: electron-vite integra
  main/preload/renderer con HMR en una sola config y es el estándar de facto para este stack.
- **Server como proceso aparte en dev** (`tsx watch`) — descartado embeberlo en el main de
  Electron desde ya: mantenerlo separado simplifica los tests (supertest contra `app.ts` sin
  levantar Electron) y deja abierta la decisión de despliegue de la constitution.
- **CSS plano en el shell** — descartado adoptar Tailwind/styled-components ahora: la decisión
  de sistema de estilos merece tomarse cuando exista la primera UI real (Fase 4); el shell no
  la fuerza.
- **Puerto del server 3030 fijo en dev** vía constante en `src/shared/` — configurable por env
  cuando haga falta.

## Riesgos

- **`better-sqlite3` es módulo nativo:** compila contra el Node del sistema para el server. Si
  en el futuro se embebe en Electron habrá que recompilarlo con `electron-rebuild` — no bloquea
  esta fase porque solo lo usa el server.
- **Compatibilidad Electron ↔ obs-studio-node:** si la versión requerida de Electron resulta
  muy vieja para electron-vite/React actuales, se documenta el conflicto y se decide con el
  owner antes de seguir (es el riesgo mayor del proyecto, mejor descubrirlo ya).
- **Windows + módulos nativos:** `better-sqlite3` necesita toolchain de build si no hay binario
  precompilado para la versión de Node local; mitigación: usar versiones con prebuilds.

---

**Estado:** ⏳ pendiente de aprobación
