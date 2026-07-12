# Plan — Editor: pistas de audio por nombre (exportar y guardar edit)

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Tres piezas: **sondear** las pistas del MP4, **mezclar** solo las marcadas al exportar, y
**reescribir** la pista 1 del clip guardado al guardar edit.

### 1. Sondeo de pistas (main)

`ffmpeg -hide_banner -i <clip>` (sin salida; ffmpeg termina con código 1 y vuelca la info en
stderr) lista los streams con su metadata:

```
  Stream #0:2[0x3](und): Audio: aac (LC), 48000 Hz, stereo, fltp, 162 kb/s
    Metadata:
      handler_name    : mic
      title           : mic
```

Una función pura `parseAudioTracks(stderr)` devuelve `[{ index: 0, name: 'default' }, …]`, donde
`index` es el **ordinal de audio** (`a:0`, `a:1`, …) — el que ffmpeg necesita en `-map 0:a:N`.
No se añade `ffprobe-static` (otro binario de ~70 MB para leer cuatro líneas); el sondeo va con
el `ffmpeg-static` que ya está.

Los nombres los escribe nuestro remux de `feature/pistas-audio-por-rol`, así que un clip con
layout por rol se reconoce solo: `a:0` se llama `default` y hay ≥1 pista nombrada más. Un clip
sin nombres (modo escritorio, clips viejos) cae al camino degradado del spec.

### 2. Exportar con las pistas marcadas

El renderer manda en el `ExportRequest` la lista de **nombres** muteados (no índices: el main
sondea y resuelve). `buildFfmpegArgs` gana el mapeo de audio explícito (hoy no hay ninguno y
ffmpeg elige la pista por su cuenta, lo cual ya es frágil):

- 0 pistas marcadas → `-an`.
- 1 pista → `-map 0:v:0 -map 0:a:<i> -c:a aac -b:a 160k`.
- N pistas → `-filter_complex "[0:a:i][0:a:j]amix=inputs=N:normalize=0:duration=longest[aout]"`
  + `-map 0:v:0 -map [aout]`.

`normalize=0` (suma, sin dividir por el número de entradas) es lo que hace el mixer de libobs al
armar la pista `default`: con todas marcadas, el export suena igual que el original.
GIF: sin cambios (no lleva audio).

### 3. Guardar edit (reescritura in-place)

Remux del clip original con un único stream recodificado:

```
-y -i clip.mp4
-filter_complex "[0:a:1][0:a:3]amix=inputs=2:normalize=0:duration=longest[mix]"
-map 0:v -map "[mix]" -map 0:a:1 -map 0:a:2 -map 0:a:3 …   (todas las de rol, marcadas o no)
-c copy -c:a:0 aac -b:a:0 192k
-metadata:s:a:0 title=default …                            (nombres reescritos por pista)
tmp.mp4
```

Video y pistas de rol se copian (`-c copy`) — **ni un reencode de video, ni pérdida de
generación en las pistas de rol**; solo la pista 1 se re-codifica desde las fuentes intactas, así
que guardar edit N veces no degrada nada. Al terminar, `rename` atómico sobre el original (mismo
patrón que `remuxAudioTrackNames`: si falla, el clip queda íntegro). Después: `size_bytes` y
`muted_tracks` al catálogo y evento `library:changed`.

Con 0 pistas marcadas la pista 1 se genera desde `anullsrc` (silencio) para no romper la
estructura del archivo ni los reproductores.

### 4. Persistencia y UI

Migración #2 en `clips`: `muted_tracks TEXT NOT NULL DEFAULT '[]'` (nombres, JSON). El editor
carga las pistas sondeadas + los muteados guardados y pinta una fila por pista (sin `default`),
con checkbox, reutilizando el estilo de la lista de audio de Ajustes. Botón **Guardar edit** al
lado de **Exportar…**, deshabilitado si el clip no tiene pistas por rol. Tras guardar, el `src`
del `<video>` se recarga con un sufijo de cache-busting para que suene la mezcla nueva.

## Archivos / módulos afectados

- `src/shared/tracks.ts` *(nuevo)* — `ClipAudioTrack`, `SaveAudioEditRequest/Result`, helpers
  puros: pistas seleccionables (sin `default`), `soportaAudioEdit(tracks)`, normalización del
  request de IPC.
- `src/shared/export.ts` — `ExportRequest.mutedTracks?: string[]` + validación.
- `src/shared/ipc.ts` — canales `clip:get-audio-tracks` y `clip:save-audio-edit`; `EditorApi`.
- `src/main/export/probe.ts` *(nuevo)* — `parseAudioTracks` (pura) + `probeAudioTracks` (spawn).
- `src/main/export/ffmpeg-args.ts` — mapeo/mezcla de audio en el MP4 exportado.
- `src/main/export/audio-edit.ts` *(nuevo)* — `buildAudioEditArgs` (pura) + `saveAudioEdit`
  (spawn + rename atómico), con `SpawnFfmpeg` inyectable como en `track-names.ts`.
- `src/main/library/clips-repository.ts` — migración, `mutedTracks` en `Clip`, `setAudioEdit`.
- `src/main/library/manager.ts` — orquestación de guardar edit (sondeo → ffmpeg → DB → evento).
- `src/main/ipc.ts` — handlers nuevos; `ExportRun` resuelve nombres → ordinales con el sondeo.
- `src/preload/index.ts` — `window.gameclip.editor`.
- `src/renderer/views/Editor.tsx`, `src/renderer/styles.css` — lista de pistas y Guardar edit.
- Tests: `probe.test.ts`, `audio-edit.test.ts`, `tracks.test.ts` (nuevos); extender
  `ffmpeg-args.test.ts`, `clips-repository.test.ts`, `export-manager.test.ts` y
  `renderer/__tests__/editor.test.tsx`.

## Decisiones y alternativas consideradas

- **Sondear con `ffmpeg -i` en vez de añadir `ffprobe-static`** — evita un binario extra de
  decenas de MB en el bundle; el parseo es una función pura con tests.
- **El export produce UNA pista de audio (la mezcla de las marcadas)**, no un MP4 multipista.
  Es lo que espera cualquier reproductor/Discord. El multipista sigue vivo
  en el clip guardado.
- **Guardar edit no borra pistas** — solo reescribe la mezcla. Es lo que pidió el owner y hace
  la operación reversible sin guardar copias del original.
- **La selección se persiste por nombre, no por índice** — los índices dependen del archivo;
  el nombre es estable y legible en la DB.
- **Guardar edit no recorta** — el recorte es del export. Aplicarlo in-place obligaría a
  reencodear el video (pérdida de calidad e irreversible); si se quiere, va en su propio spec.

## Riesgos

- **Clipping al sumar (`normalize=0`)**: si el original ya venía al límite, sumar las mismas
  pistas puede saturar. Es exactamente lo que hace libobs al mezclar, así que el resultado con
  todo marcado es equivalente al original; con menos pistas, solo puede sonar más bajo.
- **Reescritura in-place**: se mitiga con temporal + rename atómico (nunca se sobreescribe el
  clip a medias) y bloqueando la acción si hay un export en curso.
- **Formato de la salida de `ffmpeg -i`**: es estable, pero el parseo es best-effort — si no
  reconoce nombres, el clip cae al camino degradado (una fila "Audio", sin guardar edit).
- **Caché del reproductor**: tras reescribir el archivo, Chromium podría servir el video viejo;
  se fuerza recarga con cache-busting en la URL de medios.

---

**Estado:** ✅ aprobado el 2026-07-11
