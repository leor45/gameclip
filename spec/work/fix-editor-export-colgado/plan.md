# Plan — Los editores se quedan colgados si el IPC de exportar rechaza

> **Este plan es un contrato.** Aprobado con el resto de la tanda B («arregla los 10»).

## Enfoque

Cinturón y tirantes: el main deja de lanzar por el canal y el renderer deja de confiar en que no lo
hará.

1. `src/main/ipc.ts` (`ExportRun`): `try { request = normalizeExportRequest(raw) } catch (err) {
   return { status: 'error', message } }`. El resto del handler ya devuelve resultados, nunca lanza.
2. `src/renderer/views/Editor.tsx` (`exportar`) y `EditorAvanzado.tsx` (`render`): la llamada a
   `exporter.run` dentro de `try/catch`; el rechazo se convierte en `{ status: 'error', message }` y
   sigue el camino de error existente (`setEstado('error')` / `setRenderError`). En el avanzado,
   `setRendering(false)` pasa a un `finally`.

## Archivos / módulos afectados

- `src/main/ipc.ts`
- `src/renderer/views/Editor.tsx`, `src/renderer/views/EditorAvanzado.tsx`
- `src/renderer/__tests__/editor.test.tsx`, `src/renderer/__tests__/editor-avanzado.test.tsx`
- `spec/constitution/roadmap.md`

## Decisiones y alternativas consideradas

- **Arreglar en los dos lados** frente a solo el renderer: el handler no debe rechazar por un pedido
  inválido (es un resultado, no una excepción), y el renderer no debe quedarse colgado aunque algún
  día el canal falle por otra causa (p. ej. el main reiniciándose).
- No hay test del handler: `ipc.ts` importa `electron` y no carga en vitest; lo cubre el contrato de
  tipos y los tests del renderer.

## Riesgos

- Ninguno relevante: los caminos felices no cambian.

---

**Estado:** ✅ aprobado el 2026-10-08
