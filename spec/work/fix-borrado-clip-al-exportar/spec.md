# Spec — Exportar encima del propio clip lo borra

**Tipo:** Fix
**Rama:** `fix/borrado-clip-al-exportar`
**Fecha:** 2026-10-08

## Problema / Objetivo

Si en el diálogo «Guardar recorte» se elige **el mismo archivo del clip** (un flujo natural: «quiero
reemplazar el clip por su versión recortada») y se confirma el reemplazo, **el clip original se borra
del disco** sin pasar por la papelera, y no queda ningún recorte.

### Causa raíz (auditoría bug-hunter 2026-10-08, BUG-8)

- `ExportRun` (`src/main/ipc.ts`) pasa a ffmpeg `inputPath = clip.filePath` y
  `outputPath = eleccion.filePath` sin comprobar que sean distintos.
- ffmpeg detecta la colisión («Output … same as Input #0 — exiting») y sale con código 1; si la ruta
  difiere solo en mayúsculas, la trunca al abrirla y falla a mitad.
- `ExportManager.run` trata cualquier código ≠ 0 como error y llama a
  `removePartial(job.outputPath)` → `rmSync` **del clip original**.

**Objetivo:** que nunca se pueda perder el clip de origen al exportar.

## Alcance

**Dentro:**
- `ExportRun` rechaza un destino que sea el mismo archivo que el clip (comparación de ruta canónica,
  sin distinguir mayúsculas) con un mensaje claro, sin lanzar ffmpeg.
- Defensa en profundidad: `ExportManager` nunca borra `outputPath` si es el mismo archivo que
  `inputPath`.

**Fuera (explícito):**
- Ofrecer «reemplazar el original por el recorte» como función (exigiría escribir a temporal y
  renombrar, como «guardar edit»): sería una feature aparte.

## Criterios de aceptación

- [ ] Elegir el mismo `.mp4` del clip como destino devuelve error «No se puede guardar el recorte encima del clip original…» y el clip sigue en disco.
- [ ] Igual con la ruta en otra capitalización.
- [ ] Un export que falla hacia un destino distinto sigue borrando su parcial (comportamiento actual).
