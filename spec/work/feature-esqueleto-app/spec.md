# Spec — Esqueleto de la app (Fase 1)

**Tipo:** Feature
**Rama:** `feature/esqueleto-app`
**Fecha:** 2026-07-10

## Problema / Objetivo

El repo solo tiene el workflow; no hay código. Esta tarea crea el esqueleto ejecutable del
proyecto: app Electron + React + TypeScript, server Express + SQLite, y las herramientas de
verificación (Vitest, ESLint, Prettier) para que **los gates del CLAUDE.md queden reales** y
todas las fases siguientes construyan sobre una base que compila, se lintea y se testea.

## Alcance

**Dentro:**
- Scaffolding con electron-vite: `src/main/`, `src/preload/`, `src/renderer/`, `src/shared/`.
- Ventana principal con shell de UI: layout base con navegación lateral (Biblioteca · Editor ·
  Ajustes — vistas placeholder) usando React Router.
- Preload con `contextIsolation` activo y un canal IPC de ejemplo tipado (`app:version`) que
  demuestre el patrón main ↔ preload ↔ renderer.
- Server Express + TypeScript en `server/` con `better-sqlite3`: endpoint `GET /api/health`,
  apertura/migración inicial de la base (tabla `meta`) detrás de una capa de repositorio.
- Un solo `package.json` con scripts: `dev`, `dev:server`, `typecheck`, `lint`, `format`,
  `test`, `build`.
- Vitest + ESLint (flat config) + Prettier operativos, con al menos un test real por capa
  (shared, server, renderer).

**Fuera (explícito):**
- Captura de video / libobs (Fase 3). No se instala `obs-studio-node` todavía.
- Autenticación, usuarios, JWT (Fase 2). El server solo expone health.
- UI real de biblioteca/editor (Fases 4–5): solo placeholders navegables.
- Empaquetado/distribución con electron-builder (se deja el script `build` compilando, sin
  instalador).
- Auto-arranque, bandeja, hotkeys globales (Fase 6).

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] `npm run dev` abre la ventana de Electron con la navegación lateral y las tres vistas
      placeholder navegables.
- [ ] `npm run dev:server` levanta el server y `GET http://localhost:3030/api/health` responde
      `200` con JSON (estado + versión).
- [ ] El renderer muestra un dato obtenido vía IPC desde el main (versión de la app), probando
      el bridge del preload con `contextIsolation`.
- [ ] La base SQLite se crea sola al arrancar el server (archivo + tabla `meta` con la versión
      de esquema).
- [ ] `npm run typecheck`, `npm run lint` y `npm run test` terminan en verde.
- [ ] Existe al menos un test unitario real en shared, server y renderer.
