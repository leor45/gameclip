# Plan — Un vídeo sin duración en la cabecera deja las miniaturas en bucle

> **Este plan es un contrato.** Aprobado con el resto de la tanda C («sí, adelante»).

## Enfoque

1. `src/renderer/lib/useThumbnailer.ts`: en el `then`, añadir el clip a `fallidos` también cuando
   `!Number.isFinite(media.durationSeconds)`. Se sigue llamando a `setMedia` para guardar la
   miniatura (el main ya ignora la duración no finita).

## Archivos / módulos afectados

- `src/renderer/lib/useThumbnailer.ts` (+ `src/renderer/__tests__/use-thumbnailer.test.tsx`)
- `spec/constitution/roadmap.md`

## Decisiones y alternativas consideradas

- **Marcar como fallido** frente a mandar `durationSeconds: 0`: un 0 se pintaría como «0:00» en la
  tarjeta, que es falso; sin duración la tarjeta no la muestra.

## Riesgos

- Ninguno relevante: solo cambia qué clips se reintentan en la sesión.

---

**Estado:** ✅ aprobado el 2026-10-09
