# Tasks — Editor avanzado (NLE) — Fase 1

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## A. Backend / lógica pura (con tests primero donde aplique)

- [ ] 1. `@shared/tracks`: helpers de **ganancia por pista** (clave→ganancia, ordinal→ganancia) +
      `normalizeTrackVolumes`. Tests.
- [ ] 2. `@shared/timeline` *(nuevo)*: modelo puro del timeline (trim clamp, volúmenes, mapeo a
      ganancias por ordinal, tiempo↔px). Tests.
- [ ] 3. `main/export/ffmpeg-args`: variante de `amixFilter`/`audioArgs` con **ganancias** antes del
      `amix`. Tests (0%, 100%, 200%, mezcla, una sola pista).
- [ ] 4. `main/export/waveform` *(nuevo)*: extracción PCM por pista (ffmpeg `-f s16le`) + reducción a
      picos. La **reducción es pura y testeable**; el spawn se inyecta. Tests.
- [ ] 5. `@shared/export`: `ExportRequest.trackVolumes` (+ normalización, alias de `mutedTracks`).

## B. IPC / preload

- [ ] 6. `@shared/ipc`: canal `ClipGetAudioWaveforms` + contrato.
- [ ] 7. `main/ipc`: handler de waveforms; `ExportRun` traduce volúmenes→ganancias por ordinal y
      renderiza a archivo nuevo (no toca el original).
- [ ] 8. `preload`: exponer `editor.getWaveforms` (y el render ya existe vía `exporter.run`).

## C. UI del editor avanzado

- [ ] 9. Ruta `#/editor-avanzado/:clipId` + botón "Editor avanzado" en `Editor.tsx`.
- [ ] 10. `EditorAvanzado.tsx`: layout (preview + timeline + barra), carga de clip/pistas/waveforms.
- [ ] 11. `Timeline` + `Playhead`: regla, zoom, playhead arrastrable, seek; recorte con asas.
- [ ] 12. `AudioTrackRow` + `Waveform` (canvas): espectro por pista, volumen por **rueda**/arrastre,
      eliminar pista; el espectro escala con el volumen.
- [ ] 13. `RenderDialog`: calidad/formato/destino → `exporter.run` con progreso; original intacto.
- [ ] 14. Estilos en `styles.css` (paleta GameClip); barra con aspecto/captura deshabilitados
      ("Próximamente").

## Tests unitarios (obligatorios)

- [ ] Ganancias ffmpeg (camino feliz + bordes), reducción a picos, modelo de timeline, normalización
      de volúmenes/export.
- [ ] Render del `EditorAvanzado` (monta timeline, sliders, botón render) con mocks de IPC.

## Verificación (gates)

- [ ] Type-check · lint · tests verdes.
- [ ] Bump de versión a 0.8.0 en `package.json`.
- [ ] Comprobación manual/visual: abrir editor avanzado, ver espectros, ajustar volumen, recortar,
      renderizar a archivo nuevo dejando el original intacto.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada
- [ ] `spec/constitution/roadmap.md` actualizado
