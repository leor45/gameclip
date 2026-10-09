# Spec — Renderizar con cortes un vídeo sin audio falla en ffmpeg

**Tipo:** Fix
**Rama:** `fix/export-concat-sin-audio`
**Fecha:** 2026-10-08

## Problema / Objetivo

Auditoría bug-hunter B, BUG-6 (Low). En la ruta de concatenación (≥2 segmentos) sin selección de
pistas, `concatAudioSource` devuelve `[0:a:0]anull[mixfull]`: con un MP4 **sin stream de audio**
ffmpeg aborta al construir el filtergraph (stream inexistente) y el render falla sin archivo. La ruta
rápida deja elegir a ffmpeg y la reencuadrada usa `0:a:0?`, así que es un descuido, no una decisión.

**Cómo se llega:** `ipc.ts` sondea las pistas (`probeTracks`) y solo fija `audioGains`/`audioTracks`
si hay pistas; con cero pistas deja ambos `undefined` y el job llega a `buildConcatArgs` como «sin
selección». Un MP4 sin audio entra en la biblioteca por `reconcile` (cataloga cualquier `.mp4`).

**Causa raíz:** la decisión «el archivo no tiene audio → exportar sin audio» no existía; se mezclaba
con «no se eligió nada → que ffmpeg decida».

## Alcance

**Dentro:**
- Helper puro `exportAudioSelection(tracks, request)` en `export/ffmpeg-args.ts`: sin pistas →
  `audioTracks: []` (sin audio); con `trackVolumes` → ganancias; con `mutedTracks` → índices activos.
- `ipc.ts` usa el helper (misma condición de sondeo que hoy: MP4 con selección del editor).
- Test de regresión: clip sin pistas + ≥2 cortes → args con `-an`, sin `0:a:0`.

**Fuera (explícito):**
- Cambiar la ruta rápida o el GIF.

## Criterios de aceptación

- [ ] `exportAudioSelection([], …)` → `{ audioTracks: [] }`; con pistas conserva el comportamiento
      actual (ganancias o índices).
- [ ] `buildFfmpegArgs` con segments ≥2 y la selección de un clip sin audio no contiene `0:a:0` y sale
      con `-an`.
- [ ] Suite verde.
