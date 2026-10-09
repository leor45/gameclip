# Plan — El escaneo de la biblioteca cataloga los temporales de ffmpeg

> **Este plan es un contrato.** Aprobado con el resto de la tanda B («arregla los 10»).

## Enfoque

1. `src/shared/library.ts`: `TEMP_FILE_PREFIX` e `isTempMediaFile(fileName)` (compara el nombre
   base, sin ruta).
2. `src/main/capture/track-names.ts` y `src/main/export/audio-edit.ts`: `${TEMP_FILE_PREFIX}names-…` /
   `${TEMP_FILE_PREFIX}edit-…`.
3. `src/main/library/manager.ts` (`mediaFilesIn`): `if (isTempMediaFile(entry.name)) continue;`.

## Archivos / módulos afectados

- `src/shared/library.ts`, `src/shared/__tests__/library.test.ts`
- `src/main/capture/track-names.ts`, `src/main/export/audio-edit.ts`
- `src/main/library/manager.ts`, `src/main/__tests__/library-manager.test.ts`
- `spec/constitution/roadmap.md`

## Decisiones y alternativas consideradas

- **Filtrar por prefijo propio** (elegida) frente a saltar todo fichero que empiece por punto: más
  acotado; un usuario que importe un `.algo.mp4` raro seguiría viéndolo.

## Riesgos

- Ninguno: los temporales nunca debieron entrar en el catálogo.

---

**Estado:** ✅ aprobado el 2026-10-08
