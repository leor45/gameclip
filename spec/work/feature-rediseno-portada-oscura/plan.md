# Plan — Rediseño «Portada oscura»

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

El rediseño es casi todo CSS y marcado del renderer, con tres piezas de lógica nueva acotadas a las
excepciones aprobadas (iconos, modales propios, componentes de la Biblioteca y de la barra superior).
Se hace en dos fases para poder repartir el trabajo sin pisarse:

**Fase 1 — base común (secuencial, en la rama `feature/rediseno-portada-oscura`):**

1. **Tokens y fuentes.** `:root` de `styles.css` pasa a los tokens del diseño (`--ink`, `--page`,
   `--raise`, `--rule`, `--paper`, `--dim`, `--sello`, `--rec`) y las fuentes (`--font-display`
   Anton, `--font-ui` Barlow, `--font-mono` Geist Mono). Los tokens viejos (`--bg`, `--bg-panel`,
   `--border`, `--text`, `--text-dim`, `--accent`) quedan como alias de los nuevos para que el CSS
   que aún no se ha tocado siga funcionando durante la transición. Fuentes empaquetadas con
   `@fontsource/anton`, `@fontsource/barlow` y `@fontsource/geist-mono` (woff2 locales; el CSP
   `default-src 'self'` ya las admite).
2. **CSS por área.** `styles.css` se queda con base, tokens y primitivas compartidas (botones,
   píldoras, interruptores, campos, teclas, modal). Cada área recibe su archivo, importado en
   `main.tsx`: `styles/shell.css` (lateral + barra superior), `styles/library.css`,
   `styles/settings.css`, `styles/editor.css`, `styles/auth.css`. Cada agente de la fase 2 mueve las
   reglas de su área a su archivo; así no se pisan.
3. **Contratos compartidos** (tipos, preload y stubs, para que la fase 2 trabaje en paralelo):
   - **Iconos:** `window.gameclip.icons.forGame(name)` y `icons.forExe(executable)` →
     `Promise<string | null>` (data URL PNG de 64 px; `null` = sin icono). Canales `icons:for-game`
     e `icons:for-exe`. En el renderer, `useIcon` (caché en memoria por clave, una sola petición por
     clave en vuelo) y `<GameIcon>` con variantes fijas `desktop`, `all`, `pad`, `mic` y reserva al
     logo de GameClip (`build/icon.svg` copiado a `src/renderer/assets/`). Hasta la fase 2 el main
     responde `null` y todo se ve con el logo.
   - **Modal:** `<Modal>` (role `dialog`/`alertdialog`, foco inicial configurable, Esc y clic fuera
     cierran, bloquea el fondo, devuelve el foco al cerrar) y `<ConfirmDialog>` encima.
   - **Pregunta de reinicio por HDR:** el main envía `ui:ask-hdr-restart` con un id y espera la
     respuesta por `ui:hdr-restart-answer` (`'now' | 'later'`). Si la ventana principal no existe o
     no está visible, se usa el `showMessageBox` nativo de hoy; si la ventana se cierra con la
     pregunta abierta, cuenta como «Al próximo arranque» (igual que cancelar el nativo). Sin tiempo
     límite: un temporizador mostraría el diálogo nativo encima del modal que el usuario aún lee.
   - **Contadores del filtro:** `library.gameStats()` (`library:game-stats`) → total, escritorio y
     clips por juego ordenados, calculado con `computeGameStats` sobre el catálogo.

**Fase 2 — áreas en paralelo** (un agente por rama `feature/rediseno-<área>` creada desde la rama de
la feature, en worktree aislado; cada uno con su CSS y sus componentes, tests propios y suite
completa):

| Área | Qué hace | Archivos principales |
|---|---|---|
| Iconos (main) | Resolver nombre de juego → ejecutable (índice de juegos con ruta, juegos manuales, proceso detectado), `app.getFileIcon` a 64 px, logo del paquete para apps de Microsoft Store, caché en disco (`userData/icons/`) y memoria, nunca bloquear | `src/main/icons/*`, `src/main/ipc.ts`, `src/main/games/*` (guardar la ruta del exe en el índice) |
| Lateral y barra superior | Variante A, menú de duración con enlace a General, estados de actualización, sesión, versión | `Sidebar.tsx`, `CaptureBar.tsx`, `StorageIndicator.tsx`, `UpdateModal.tsx`, `styles/shell.css` |
| Biblioteca | Grupos por fecha, panel reproductor y filas, ↑ ↓ / Intro, filtro propio con contadores y buscador, acciones al pasar el cursor, modales de eliminar | `Biblioteca.tsx`, `ClipCard.tsx`, `ClipPlayer.tsx`, componentes nuevos de la Biblioteca, `styles/library.css` |
| Ajustes | Layout con pie fijo, las 8 secciones, interruptores, filas de mezcla con iconos fijos, listas de juegos con icono, llegada a General con foco, modal de reinicio HDR (renderer + main) | `views/ajustes/*`, `src/main/index.ts` (HDR), `styles/settings.css` |
| Editor y acceso | «Ediciones sin terminar», editor básico, avanzado, diálogo de render, login, registro | `Editor.tsx`, `EditorAvanzado.tsx`, `components/editor-avanzado/*`, `auth/*`, `styles/editor.css`, `styles/auth.css` |

**Fase 3 — integración y control:** merge `--no-ff` de cada rama de área en la rama de la feature,
revisores independientes que solo buscan bugs **introducidos** (leen los diffs), correcciones con el
mismo agente hasta «cerrado», gates y verificación visual en la app real (CDP / capturas) de cada
pantalla contra la maqueta.

## Archivos / módulos afectados

- `package.json` — dependencias `@fontsource/anton`, `@fontsource/barlow`, `@fontsource/geist-mono`.
- `src/renderer/styles.css` + `src/renderer/styles/*.css` (nuevos) — tokens, primitivas y CSS por área.
- `src/renderer/main.tsx` — imports de fuentes y hojas de estilo.
- `src/renderer/components/{GameIcon,Modal,ConfirmDialog}.tsx`, `src/renderer/lib/useIcon.ts`,
  `src/renderer/assets/logo.svg` (nuevos).
- `src/shared/ipc.ts`, `src/preload/index.ts` — `icons` y la pregunta de reinicio HDR.
- `src/main/icons/` (nuevo), `src/main/ipc.ts`, `src/main/games/*`, `src/main/index.ts`.
- Vistas y componentes del renderer listados en la tabla de la fase 2.
- Tests del renderer y del main que fijan marcado o CSS (`biblioteca-css.test.ts`, `sidebar`,
  `capture-ui`, `biblioteca`, `ajustes`, `editor*`…), actualizados sin perder lo que verifican.

## Decisiones y alternativas consideradas

- **Iconos con `app.getFileIcon`** (Electron, sin dependencias) — descartado un extractor nativo
  propio: `getFileIcon` ya da el icono del shell. Para apps de Microsoft Store (alias en
  `WindowsApps`) se lee el logo del paquete (`AppxManifest.xml`), porque el ejecutable no trae icono.
- **Data URL por IPC** en lugar de un protocolo nuevo — son ~4 KB por icono y se cachean; un protocolo
  añadiría CSP y superficie sin ganancia.
- **Desplegables propios** (filtro de juego, duración) en lugar de `<select>` nativo — el nativo no
  admite iconos, contadores ni buscador. Accesibilidad: `listbox`/`option`, teclado (↑ ↓, Intro, Esc,
  escribir para buscar) y foco visible.
- **Modal HDR con respaldo nativo** — si el renderer no puede preguntar, se usa el diálogo de hoy:
  nunca se reinicia sin preguntar ni se pierde la pregunta.
- **Tokens viejos como alias** durante la transición — evita una fase intermedia rota; se retiran al
  final si ya nadie los usa.
- **Reparto por área en paralelo** — cada área es independiente una vez fijados tokens, primitivas y
  contratos; los archivos CSS separados evitan conflictos en `styles.css`.

## Riesgos

- **Regresiones funcionales escondidas en el marcado:** tests y E2E que buscan textos o roles
  (p. ej. el `select` de duración, el `confirm` de eliminar). Se actualizan los tests manteniendo lo
  que comprueban y los revisores buscan acciones perdidas.
- **Coste de los iconos:** extraer iconos en el hilo principal o pedirlos por cada tarjeta podría
  frenar la app mientras se juega. Mitigación: caché en disco y memoria, una petición por juego,
  extracción perezosa y `null` rápido si no hay ruta.
- **Panel reproductor:** liberar el `<video>` al cambiar de clip o cerrar (Windows bloquea el archivo
  y no deja borrarlo — ver `fix-borrado-clip-archivo-bloqueado`).
- **Fuentes:** que `@fontsource` funcione con `file://` en el build portable; se verifica en el build.
- **Editor avanzado:** su CSS controla medidas de la timeline; el restyle no puede tocar geometría que
  usan los cálculos (playhead, asas, filmstrip).

---

**Estado:** ✅ aprobado el 2026-10-09 (el owner aprobó el rediseño y pidió crear la spec y ejecutar)
