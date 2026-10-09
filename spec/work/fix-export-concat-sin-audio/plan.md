# Plan — Renderizar con cortes un vídeo sin audio falla en ffmpeg

> **Este plan es un contrato.** Aprobado con el resto de la tanda B («arregla los 10»).

## Enfoque

1. `src/main/export/ffmpeg-args.ts`: `exportAudioSelection(tracks, { format, trackVolumes,
   mutedTracks })` → `{ audioTracks?, audioGains? }`. Lógica que hoy vive inline en `ipc.ts`, más la
   regla nueva: `tracks.length === 0` → `audioTracks: []`.
2. `src/main/ipc.ts` (`ExportRun`): sondear igual que hoy y delegar en el helper.

## Archivos / módulos afectados

- `src/main/export/ffmpeg-args.ts`, `src/main/__tests__/ffmpeg-args.test.ts`
- `src/main/ipc.ts`
- `spec/constitution/roadmap.md`

## Decisiones y alternativas consideradas

- **Decidirlo con el sondeo** (elegida) frente a `0:a:0?` en el filtergraph: ffmpeg no admite el `?`
  dentro de `-filter_complex`, solo en `-map`; la ruta concat necesita saber de antemano si hay audio.
- La lógica sale de `ipc.ts` (no testeable: importa `electron`) a un helper puro con tests.

## Riesgos

- Ninguno en los caminos con audio: el helper reproduce la lógica actual.

---

**Estado:** ✅ aprobado el 2026-10-08
