# Plan — Exportar encima del propio clip lo borra

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

1. Helper puro `mismoArchivo(a, b)` en `src/main/export/manager.ts` (reutiliza `clipPathKey` de
   `library/clip-path.ts`: ruta resuelta, sin barra final, en minúsculas).
2. `ExportManager.run`: si `mismoArchivo(job.inputPath, job.outputPath)` → devuelve
   `{ status: 'error', message }` **sin** lanzar ffmpeg. Cubre el IPC y cualquier llamador futuro.
3. `removePartial` recibe también el `inputPath` y no borra si coinciden (cinturón y tirantes).

El chequeo vive en el manager, no solo en `ipc.ts`, porque ahí está el `rmSync` peligroso y el manager
sí tiene tests (el IPC no).

## Archivos / módulos afectados

- `src/main/export/manager.ts` — guarda y borrado seguro.
- `src/main/__tests__/export-manager.test.ts` — regresión.

## Decisiones y alternativas consideradas

- **Rechazar con mensaje en vez de exportar a temporal y reemplazar** — reemplazar el original es una
  función nueva (fuera de alcance); el bug es la pérdida de datos.

## Riesgos

- Ninguno relevante: solo se añade una rama de rechazo.

---

**Estado:** ✅ aprobado el 2026-10-08 (auto-aprobado por indicación del owner, con los 9 planes de la auditoría listos)
