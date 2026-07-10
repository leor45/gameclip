# Flujo de trabajo — spec → plan → tasks

Versión condensada de la guía de intake. Cada tarea vive en `spec/work/<nombre-de-rama>/`
(con `/` convertido en `-`, ej. rama `feature/auth-login` → carpeta `feature-auth-login/`).

## Antes de empezar: ¿qué tipo de trabajo es?

- **Feature** — capacidad nueva → flujo completo: `spec.md` + `plan.md` (proponer y **esperar OK**) + `tasks.md`.
- **Fix** — algo se comporta mal → flujo completo **+ test de regresión que reproduce el bug primero** (rojo → verde). Indicar causa raíz en `spec.md`.
- **Hotfix** — urgente, trivial, bajo riesgo → solo `spec.md` corto (qué se rompió · causa raíz · arreglo). Los gates corren igual. Si resulta no trivial, se promueve a Fix.

## Los cinco pasos

1. **Rama.** `feature/…`, `fix/…` o `hotfix/…` desde `main`. Nunca trabajar directo en `main`.
2. **Spec.** `spec.md` — el *qué* y el *porqué*: problema, objetivo, alcance (dentro **y** fuera),
   criterios de aceptación. Sin detalle de implementación.
3. **Plan.** `plan.md` — el *cómo*: enfoque, archivos afectados, decisiones, riesgos.
   **Proponerlo y esperar el OK del owner antes de escribir código.**
4. **Tasks.** `tasks.md` — pasos pequeños y verificables, **incluyendo tests unitarios**.
   Una tarea a la vez; marcar el progreso.
5. **Entrega.** Implementar → gates verdes (**type-check · lint · tests**) → aprobación escrita →
   `git merge --no-ff` a `main` → borrar la rama (`git branch -d`).

Para crear la carpeta de una tarea nueva: `./spec/new-work.ps1 <nombre-de-rama>`

## Las dos reglas

1. **El plan es un contrato.** Aprobado el plan, el alcance queda fijo. Lo nuevo lleva su propio
   spec/plan — nunca se absorbe "gratis" en la tarea actual.
2. **Los tests son obligatorios.** Todo trabajo no trivial deja la suite verde. Un bug post-merge
   empieza con un test de regresión en una rama `fix/` nueva desde `main`.

## Al terminar la tarea

1. Commit en la rama con mensaje claro (en español).
2. Gates verdes: type-check · lint · tests.
3. Aprobación del owner → merge `--no-ff` → `git branch -d`.
4. Actualizar `spec/constitution/roadmap.md` (marcar entregado).
5. Marcar los checkboxes de `tasks.md` — la carpeta queda como registro fiel.
