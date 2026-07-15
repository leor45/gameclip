# Plan — Editor avanzado (NLE) — Fase 5: extras (captura de frame · filmstrip · drafts)

> **Este plan es un contrato.** Cubre solo la **Fase 5**. Se propone y se **espera el OK del owner antes
> de codear**. Aprobado, el alcance queda fijo.

## Enfoque

Tres piezas independientes, cada una con su lógica pura testeable y su UI. El editor **simple** no se
toca; el resto de la app tampoco (salvo la pestaña Editor, que gana la lista de drafts).

### A. Drafts persistentes (auto, `localStorage` por clip)

**1. Módulo `renderer/lib/editor-drafts.ts` (testeable con `localStorage` de jsdom).**
- Tipo `EditorDraft { clipId, segments, volumes, removed: string[], reframe, updatedAt }`.
- Clave `gameclip.editor.draft.<clipId>`.
- `isDefaultEdit(segments, duration, volumes, removed, reframe)` — puro: ¿la edición es el estado
  “virgen” (un único segmento `[0,dur]`, sin volúmenes ≠ 1, sin pistas quitadas, reframe `original`)?
- `saveDraft(draft)` / `loadDraft(clipId)` / `deleteDraft(clipId)` — best-effort (`try/catch`).
- `listDrafts()` — escanea `localStorage` por prefijo y devuelve los drafts (ordenados por `updatedAt`
  desc), tolerando entradas corruptas (las ignora).

**2. Editor avanzado (`EditorAvanzado.tsx`).**
- Al cargar el clip (ya se conoce `duration` y `tracks`): si hay `loadDraft(clipId)`, se **aplica**
  (segmentos vía `dispatch reset`, `volumes`, `removed`, `reframe`); si no, estado por defecto (como hoy).
- Un efecto observa `(segments, volumes, removed, reframe)`: si **no** es `isDefaultEdit` →
  `saveDraft({...})` (con `updatedAt = Date.now()`); si vuelve al defecto → `deleteDraft(clipId)`. Debounce
  ligero para no escribir en cada frame de arrastre.
- Botón **Restablecer** en la barra: `deleteDraft` + resetea segmentos/volúmenes/removed/reframe al
  defecto. Deshabilitado si ya está en el defecto.

**3. Lista de ediciones en curso en la pestaña Editor (`views/Editor.tsx`, ruta `/editor` sin clip).**
- Carga los clips de la biblioteca (`library.list`) y cruza con `listDrafts()` para pintar tarjetas:
  miniatura + título + “Editado hace…”, con **Retomar** (`Link` a `/editor-avanzado/:clipId`) y **Quitar**
  (borra la edición guardada y refresca). Si el vídeo ya no está en la biblioteca, la tarjeta muestra
  “Este vídeo ya no está en tu biblioteca” y deja **Quitar**.
- **Sin ediciones:** mensaje mejorado (ver copy abajo). Componente `DraftsList.tsx`.

**Copy exacta (toda visible por el usuario, en lenguaje sencillo):**
- Título de la sección: **“Ediciones sin terminar”**.
- Tarjeta: título del clip + **“Editado hace 5 min”** (tiempo relativo) · botones **“Retomar”** y
  **“Quitar”**.
- Clip ausente: **“Este vídeo ya no está en tu biblioteca”** + **“Quitar”**.
- Vacío: **“Aquí aparecerán tus ediciones sin terminar. Elige un clip en la Biblioteca y pulsa «Editar»
  para recortarlo, ajustar el audio y exportarlo.”**
- Botón en el editor: **“Restablecer”** (descarta los cambios y vuelve al vídeo original).

**Regla de copy (aplica a toda la fase):** el texto **visible** no usa tecnicismos (“draft”, “huérfano”,
“clip” a secas, “localStorage”, etc.). En la UI se dice **“edición”/“vídeo”**; “draft” queda solo en el
código y los specs.

### B. Captura de frame (📷 → biblioteca)

**1. Renderer — capturar el frame con el reencuadre.**
- Al pulsar 📷: se dibuja el frame actual del `<video>` en un `canvas` **con la geometría de reencuadre**
  (`@shared/reframe`): tamaño `outputW×outputH`; `cover` recorta (`drawImage` con rect de origen),
  `contain` centra sobre negro, `original` copia entero. → `canvas.toDataURL('image/png')`.
- Se manda al main por un canal nuevo `ClipCaptureFrame(clipId, pngBase64)`; feedback breve (“Frame
  guardado ✓”) reutilizando el aviso `done`/toast del editor.

**2. Main — guardar y catalogar (`ipc.ts` + helper).**
- `ClipCaptureFrame`: resuelve el clip; escribe el PNG con `targetPathFor({ outputDir: capture.outputDir(),
  gameName: clip.game, kind:'screenshot', extension:'png' })` (misma carpeta/nomenclatura Capturas que la
  hotkey) y lo **registra** con `library.registerSavedClip(path, 'scan', clip.game)`. Devuelve la ruta.
- Preload: `editor.captureFrame(clipId, pngBase64)`.

**3. Habilitar el botón 📷** (hoy `disabled` “Próximamente”) con la acción anterior.

### C. Filmstrip real (best-effort, acotado)

**1. Lógica pura (`@shared/timeline` o módulo nuevo).**
- `filmstripSampleTimes(segments, count)` — puro: `count` tiempos de **origen** equiespaciados en la
  **salida** (usa `outputToSource`), para muestrear respetando los cortes. Testeable.

**2. Componente `components/editor-avanzado/Filmstrip.tsx`.**
- `<video>` oculto + `canvas`: hace `seek` a cada tiempo de muestreo y captura una mini-imagen; las va
  dibujando en una fila que llena el ancho de la pista de vídeo. **Cache por clip** (no re-extrae al
  re-render ni al hacer zoom; se estira). Concurrencia serial (un seek a la vez). **Best-effort:** error o
  jsdom sin `<video>` real → barra vacía (como hoy).
- Sustituye el `div.eav-track-video-bar` vacío por el filmstrip.

## Archivos / módulos afectados (Fase 5)

- `src/renderer/lib/editor-drafts.ts` *(nuevo)* + `__tests__/editor-drafts.test.ts` *(nuevo)*.
- `src/renderer/views/EditorAvanzado.tsx` — cargar/guardar draft, botón Restablecer, botón 📷 activo,
  filmstrip en la pista de vídeo.
- `src/renderer/views/Editor.tsx` — lista de drafts / mensaje mejorado cuando no hay clip.
- `src/renderer/components/editor-avanzado/DraftsList.tsx` *(nuevo)* — tarjetas de drafts.
- `src/renderer/components/editor-avanzado/Filmstrip.tsx` *(nuevo)* — miniaturas.
- `src/shared/timeline.ts` — `filmstripSampleTimes` (+ tests en `timeline.test.ts`).
- `src/shared/reframe.ts` — helper de recorte para el canvas si hace falta (reusa `reframeGeometry`).
- `src/main/ipc.ts` (+ helper `capture/frame-capture.ts`) — canal `ClipCaptureFrame`.
- `src/shared/ipc.ts` — nuevo `IpcChannel.ClipCaptureFrame`.
- `src/preload/index.ts` + tipos `EditorApi` — `captureFrame`.
- `src/renderer/styles.css` — estilos de la lista de drafts y del filmstrip.
- Tests: `editor-drafts.test.ts`, `timeline.test.ts` (muestreo), `editor-avanzado.test.tsx` (draft
  guardar/restaurar/restablecer; 📷 llama al canal), y del render del frame (nombre/registro) si aplica.

## Decisiones y alternativas consideradas

- **Drafts en `localStorage`, auto.** (Decisión del owner.) Un store en el main sería más robusto ante
  borrado de clips pero añade IPC + limpieza; para una pref/estado local del renderer, `localStorage`
  keyed por clip basta. Los drafts huérfanos son inertes y se pueden borrar desde la lista.
- **Auto-guardar solo si difiere del defecto.** Evita crear un draft por cada clip que se abre; volver al
  defecto lo borra, así la lista solo muestra ediciones reales en curso.
- **Captura de frame a la biblioteca (sin diálogo).** (Decisión del owner.) Consistente con las capturas
  por hotkey (misma carpeta/nomenclatura y alta en catálogo); reusa `targetPathFor`+`registerSavedClip`.
- **Frame con el reencuadre aplicado.** La captura debe verse como la previa/el render; se dibuja con la
  misma geometría de `@shared/reframe`, no el frame crudo.
- **Filmstrip best-effort acotado (~16 fijas).** (Decisión del owner.) Re-muestrear por zoom multiplica
  seeks y complejidad; N fijas cacheadas por clip da la orientación visual con coste acotado.
- **Muestreo en tiempo de salida.** Las miniaturas deben reflejar lo que queda tras los cortes; los
  tiempos se calculan en salida y se mapean a origen con `outputToSource`.
- **Sin bump de versión hasta el release.** Al terminar F5 se hace el **release 0.8.0** (las cinco fases).

## Riesgos

- **Extracción de frames (filmstrip):** seeks encadenados en un `<video>` pueden ser lentos o fallar en
  algunos códecs. Mitigado: serial, cacheado, best-effort (barra vacía si falla), N acotada.
- **Coste/tamaño de los drafts en `localStorage`:** el estado es pequeño (arrays de números + flags);
  sin miniaturas. Entradas corruptas se ignoran al listar.
- **`toDataURL` del frame reencuadrado:** hay que dibujar el rect de origen correcto (mismo que el `crop`
  de ffmpeg); se deriva de `reframeGeometry` y se testea la geometría del recorte.
- **Draft vs. edición viva:** cargar el draft debe ocurrir **después** de conocer `duration`/`tracks`
  (para validar segmentos/pistas); se hace en el mismo punto donde hoy se inicializan.

---

**Estado:** ✅ aprobado por el owner el 2026-07-14 ("dale ejecuta el plan"; copy sencilla acordada).
