# GameClip — instrucciones para el agente

Grabador de clips de juegos (funciones premium, sin nube por ahora): captura de clips de juegos y grabación
de escritorio. App Electron + React + TypeScript con server Express en el mismo repo (un solo
`package.json`, sin monorepo). Documentación y commits **en español**.

## Workflow (spec-driven) — obligatorio

Todo el trabajo sigue `spec → plan → tasks`. La guía condensada está en `spec/work/README.md`;
la constitution (misión · tech-stack · roadmap) en `spec/constitution/`.

- **Feature:** `spec.md` + `plan.md` (proponer y **esperar el OK del owner antes de codear**) + `tasks.md`.
- **Fix:** igual + causa raíz en el spec + **test de regresión primero** (rojo → verde).
- **Hotfix:** solo `spec.md` corto; los gates corren igual.
- Tarea nueva: `./spec/new-work.ps1 <rama>` crea `spec/work/<rama-con-guiones>/` desde `_template/`.
- **Regla 1 — el plan es un contrato:** aprobado el plan, el alcance queda fijo; lo nuevo lleva su propio spec/plan.
- **Regla 2 — tests obligatorios:** trabajo no trivial deja la suite verde; sin tests no hay done.
- Al entregar: actualizar `spec/constitution/roadmap.md` y marcar los checkboxes de `tasks.md`.

## Git flow

- Una rama por tarea: `feature/…`, `fix/…`, `hotfix/…`. **Nunca commitear directo en `main`.**
- Merge a `main` solo cuando el owner lo pida, siempre con `git merge --no-ff`.
- Borrar la rama después del merge con `git branch -d` (nunca antes).
- Mensajes de commit en español.

## Comandos (gates de verificación)

Quedan operativos al completar la Fase 1 del roadmap (scaffolding); ver `spec/constitution/tech-stack.md`.

| Gate | Comando |
|---|---|
| Type-check | `npm run typecheck` |
| Lint | `npm run lint` |
| Tests | `npm run test` |
| Dev app | `npm run dev` |
| Dev server | `npm run dev:server` |

Antes de dar una tarea por terminada: type-check · lint · tests **verdes**.

## Multi-agente

Preferencias por máquina en `preferences.local.json` (git-ignored; template en
`preferences.example.json`). Reglas por encima del mapa de modelos: delegar solo trabajo
**independiente y paralelizable**; lo trivial o secuencial va **inline** en un solo agente.

## Notas del stack

- La versión de Electron la dicta la compatibilidad con `obs-studio-node` (captura libobs), no al revés.
- `contextIsolation` activo; todo IPC pasa por el preload.
- SQLite (`better-sqlite3`) detrás de una capa de repositorio para poder migrar a Postgres.
- Windows es la plataforma objetivo.
