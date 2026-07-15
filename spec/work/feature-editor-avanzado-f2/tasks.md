# Tasks — Editor avanzado (NLE) — Fase 2: audio en vivo por pista

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## A. Backend / main (con tests donde aplique)

- [x] 1. `main/export/track-audio` *(nuevo)*: `trackAudioArgs` (pura) + `extractTrackAudio` (spawn
      inyectable, best-effort → `Buffer` vacío al fallar). Tests (args, éxito, fallo de spawn/código).
- [x] 2. `main/export/manager`: `trackAudio(file, trackIndex)` — valida el índice con `selectableTracks`
      y devuelve los bytes de la pista.

## B. IPC / preload

- [x] 3. `@shared/ipc`: canal `ClipGetTrackAudio` + contrato (`{ id, trackIndex } ⇒ ArrayBuffer`) +
      `EditorApi.getTrackAudio`.
- [x] 4. `main/ipc`: handler de `ClipGetTrackAudio` (resuelve el clip, llama a `exp.trackAudio`).
- [x] 5. `preload`: expone `editor.getTrackAudio(id, trackIndex)`.

## C. Motor de audio en vivo (renderer)

- [x] 6. `renderer/lib/live-audio` *(nuevo)*: helpers puros (`shouldResync`, ganancia efectiva) + clase
      `LivePreviewAudio` (grafo pista→gain→master, load perezoso, play/pausa/stop/seek, setGain,
      dispose). No-op silencioso sin `AudioContext`. Tests de lo puro y del no-op.
- [x] 7. `renderer/__tests__/setup`: mock `editor.getTrackAudio` (→ `ArrayBuffer` vacío).

## D. Integración en el editor

- [x] 8. `EditorAvanzado.tsx`: `<video muted>`, instanciar el motor, cablear play/pausa/stop/seek,
      volumen/eliminado en vivo, corrección de deriva en el `rAF`, `dispose` al desmontar; feedback de
      carga en el primer play. Ganancia efectiva centralizada (preview = render).

## Tests unitarios (obligatorios)

- [x] Args de extracción por pista + extracción best-effort (éxito/fallo).
- [x] `shouldResync` (dentro/fuera del umbral) y mapeo de ganancia efectiva (eliminada → 0).
- [x] El motor no rompe sin `AudioContext`; el test de `EditorAvanzado` sigue verde (play sin audio real).

## Verificación (gates)

- [x] Type-check · lint · tests verdes (651).
- [x] Comprobación propia: reproducir sin `AudioContext` no rompe (test); **AAC/ADTS de la extracción
      real decodifica en Chromium** (verificado headless: `decodeAudioData` → AudioBuffer 2.03 s con
      señal, RMS 0.062).

## Cierre

- [ ] **Detenerse** — el owner prueba E2E (oír la mezcla en vivo, volumen al momento, eliminar, seek,
      clip de 1 pista) y da el OK.
- [ ] Merge a `main` con `--no-ff` y rama borrada (sin release; el 0.8.0 se publica al final).
- [ ] `spec/constitution/roadmap.md` actualizado.
