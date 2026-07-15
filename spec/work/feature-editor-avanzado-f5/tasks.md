# Tasks — Editor avanzado (NLE) — Fase 5: extras (captura de frame · filmstrip · drafts)

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

### A. Drafts
- [x] 1. `renderer/lib/editor-drafts.ts`: tipo `EditorDraft`, clave, `sameEdit`, `save/load/delete`,
      `listDrafts` (best-effort, tolera corruptos).
- [x] 2. `EditorAvanzado.tsx`: aplicar draft al cargar; auto-guardar/borrar al cambiar la edición
      (debounce, sin re-escribir/bumpear al abrir); botón **Restablecer**.
- [x] 3. `DraftsList.tsx` + `Editor.tsx`: “Ediciones sin terminar” (Retomar/Quitar; si el vídeo ya no está,
      copy sencilla) y mensaje mejorado cuando no hay ninguna. Toda la copy en lenguaje sencillo.

### B. Captura de frame
- [x] 4. `IpcChannel.ClipCaptureFrame` + preload `editor.captureFrame`; handler en `ipc.ts` + helper
      `frame-capture.ts` que escribe el PNG (`targetPathFor`) y registra (`registerSavedClip`).
- [x] 5. `EditorAvanzado.tsx`: dibujar el frame con la geometría de reencuadre en un canvas → PNG → canal;
      activar el botón 📷 + aviso.

### C. Filmstrip
- [x] 6. `filmstripSampleTimes(segments, count)` en `@shared/timeline`.
- [x] 7. `Filmstrip.tsx`: extracción serial best-effort + cache por clip; reemplaza la barra vacía.
- [x] 8. Estilos (drafts + filmstrip + aviso de frame) en `styles.css`.

### Fixes tras E2E (causa raíz en el spec)
- [x] F5-fix-1 — 📷: fijar `sourceDims`/`duration` también en `onLoadedData` (no solo `onLoadedMetadata`)
      + fallback leyendo dimensiones del `<video>` al capturar. Regresión: `editor-avanzado.test.tsx`
      "📷 funciona aunque no llegue loadedMetadata".
- [x] F5-fix-2 — filmstrip: `Filmstrip` recibe la `duration`; no extrae ni cachea con duración 0;
      reintenta al conocerla y no cachea resultados vacíos. Regresión: `filmstrip.test.tsx`.

## Tests unitarios (obligatorios)

- [x] `editor-drafts`: `sameEdit` (defecto vs. con cortes/volumen/removed/reframe); `save`→`load`;
      `delete` quita; `listDrafts` ordena por `updatedAt` e ignora corruptos.
- [x] `timeline`: `filmstripSampleTimes` reparte en salida y mapea a origen (con y sin cortes; casos borde).
- [x] `frame-capture` (main): decodifica base64 → escribe PNG en Capturas → registra; PNG vacío → null.
- [x] `editor-avanzado.test.tsx`: al reabrir con draft se restaura; editar auto-guarda; **Restablecer** lo
      borra; 📷 invoca `editor.captureFrame` con el PNG.
- [x] `drafts-list`: lista ediciones y **Quitar** las saca; vídeo ausente con copy sencilla; sin ninguna,
      mensaje.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 742 tests (+2 regresión de los fixes)
- [x] Comprobación manual (E2E owner): editar→salir→retomar restaura; Restablecer descarta; 📷 deja el PNG
      reencuadrado en la biblioteca; el filmstrip muestra miniaturas reales. (OK tras los fixes de la E2E.)

## Cierre

- [x] Aprobación del owner (E2E)
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
- [x] (Tras F5) **Release 0.8.0** — las cinco fases del editor avanzado.
