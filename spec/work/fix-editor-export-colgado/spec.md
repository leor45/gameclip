# Spec — Los editores se quedan colgados si el IPC de exportar rechaza

**Tipo:** Fix
**Rama:** `fix/editor-export-colgado`
**Fecha:** 2026-10-08

## Problema / Objetivo

Auditoría bug-hunter B, BUG-10 (Medium). `Editor.exportar` y `EditorAvanzado.render` hacen
`await window.gameclip.exporter.run(...)` sin `try/catch`, y el handler `ExportRun` del main llama a
`normalizeExportRequest` **antes** de devolver nada: si el pedido no valida («El recorte debe durar al
menos 0.5 s», inicio/fin inválidos) el handler lanza, el `invoke` rechaza y los editores nunca salen
de «exportando»/«renderizando»: el botón desaparece y queda una barra al 0 % con un «Cancelar» que
no cancela nada (no hay ffmpeg). Solo se recupera navegando.

**Disparador real:** abrir un clip sin `durationSeconds` (el thumbnailer aún no pasó) y pulsar
Exportar antes de que el `<video>` cargue los metadatos (`duracion = 0` → inicio = fin = 0), o un
clip cuyo vídeo falla al cargar (la duración nunca llega).

**Causa raíz:** el contrato de `exporter.run` es «siempre resuelve con un `ExportResult`», pero el
handler puede rechazar, y el renderer confía en el contrato.

## Alcance

**Dentro:**
- `ipc.ts`: el handler captura el error de validación y devuelve `{ status: 'error', message }`
  (contrato uniforme).
- `Editor.tsx` y `EditorAvanzado.tsx`: `try/catch` alrededor de `exporter.run`; un rechazo se trata
  como `status: 'error'` y la UI vuelve a su estado normal con el mensaje.
- Tests de regresión en los dos editores con `exporter.run` rechazando.

**Fuera (explícito):**
- Deshabilitar Exportar/Renderizar mientras la duración sea 0 (cambio de UX aparte; con el fix el
  usuario ve el mensaje «al menos 0,5 s» y puede reintentar).

## Criterios de aceptación

- [ ] Editor simple: si `exporter.run` rechaza, aparece el mensaje de error y vuelve el botón
      «Exportar…».
- [ ] Editor avanzado: si `exporter.run` rechaza, el modal muestra el error y vuelve a ofrecer
      «Renderizar vídeo».
- [ ] El handler `ExportRun` devuelve `{status:'error'}` ante un pedido inválido en vez de lanzar.
- [ ] Suite verde.
