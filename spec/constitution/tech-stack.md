# Tech Stack — GameClip

## Resumen

App web empaquetada con **Electron**, frontend y backend en **un mismo repositorio
con un solo `package.json`** — sin monorepo, sin workspaces. Todo en **TypeScript**.

| Capa | Tecnología | Notas |
|---|---|---|
| Escritorio | Electron | Proceso main + preload con `contextIsolation` |
| Frontend | React 18 + TypeScript + Vite (electron-vite) | Renderer de Electron |
| Captura | **libobs** vía `obs-studio-node` | Nativa desde el día 1: game capture, display capture, buffer de repetición, NVENC/AMF/QSV |
| Backend | Node + Express + TypeScript | API REST para auth y metadatos; corre como proceso aparte en dev |
| Base de datos | SQLite vía `better-sqlite3` | Cero infraestructura; migrable a Postgres cuando llegue la nube |
| Auth | JWT (access + refresh) + `bcrypt` | Solo usuarios directos email/contraseña por ahora |
| Tests | Vitest | Unitarios en frontend, backend y lógica del main process |
| Lint/format | ESLint + Prettier | |

## Estructura del repositorio

```
gameclip/
  src/
    main/        · proceso main de Electron (ventanas, captura libobs, hotkeys, IPC)
    preload/     · bridge seguro main ↔ renderer
    renderer/    · app React (UI: biblioteca, editor, ajustes, login)
    shared/      · tipos y constantes compartidos entre main, renderer y server
  server/        · API Express (auth, usuarios, metadatos de clips)
  spec/          · workflow spec-driven (constitution, work, templates)
  package.json   · único; scripts para app y server
```

## Comandos de verificación (gates)

> Estos son los comandos objetivo. Quedan operativos al completar la primera tarea del roadmap
> (scaffolding); hasta entonces son la definición del contrato.

| Gate | Comando |
|---|---|
| Type-check | `npm run typecheck` (`tsc --noEmit` sobre app y server) |
| Lint | `npm run lint` |
| Tests unitarios | `npm run test` (Vitest) |
| Dev app | `npm run dev` (electron-vite) |
| Dev server | `npm run dev:server` (tsx watch) |
| Build | `npm run build` + electron-builder |

## Decisiones y riesgos del stack

- **`obs-studio-node` (binding de libobs para Electron, mantenido por Streamlabs).** Es lo que usa
  Streamlabs Desktop en producción y lo más cercano a cómo capturan las apps comerciales del rubro.
  **Riesgos conocidos:** compatibilidad estricta con versiones concretas de Electron/Node (hay que
  fijar versiones), binarios nativos por plataforma, y documentación escasa (la referencia es el
  código de Streamlabs Desktop). La versión de Electron del proyecto se elige en función de la que
  soporte `obs-studio-node`, no al revés.
- **Un solo `package.json`:** simplifica todo (una instalación, un lockfile). El server se compila
  con su propio `tsconfig` y en producción corre embebido o como servicio aparte — decisión
  pendiente para cuando llegue la fase de distribución.
- **SQLite en el server:** suficiente sin nube. El acceso a datos se aísla en una capa de
  repositorio para que el salto a Postgres sea una tarea acotada.
- **Windows primero:** libobs y game capture se estabilizan en Windows antes de considerar otras
  plataformas.
