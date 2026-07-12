# Tasks — Pistas de audio por rol, ordenadas y nombradas

Plan aprobado por el owner (2026-07-11). Pasos pequeños y verificables; una tarea a la vez.

## Pieza 2 — Tope de apps con audio (modelo + UI)

- [x] 1. `AUDIO_APPS_TRACK_MAX = 3` en `shared/capture.ts`.
- [x] 2. Helper puro `orderedActiveAudioApps(settings)` (apps activas en el ORDEN visible:
       fijas primero, luego de usuario) + test.
- [x] 3. Normalización: en modo `apps`, desmarcar (no borrar) las apps activas que excedan
       el tope, de forma determinista por orden + test (rojo→verde del comportamiento nuevo).
- [x] 4. UI de audio: aviso y bloqueo al marcar una 4.ª app con audio + test en `ajustes`.

## Pieza 1 — Reparto de pistas por rol

- [x] 5. Test (rojo) de `audioTrackLayout(...)`: modo `apps`+separadas con juego+mic+2 apps →
       máscaras `game=0b000011`, `mic=0b000101`, `app0=0b001001`, `app1=0b010001`, pistas
       `[{1,default},{2,game},{3,mic},{4,<app0>},{5,<app1>}]`, `mixer` = OR de esas pistas.
- [x] 6. Test: toda máscara incluye el bit 1; modo `desktop` y `separate:false` = plan actual
       (regresión); `named` true solo en apps+separadas.
- [x] 7. Test de `appTrackName`: quita ruta y `.exe`, case-insensitive (`Discord.exe`→`Discord`).
- [x] 8. Implementar `audioTrackLayout` + `appTrackName` (reemplaza `audioTrackPlan`) (verde).
- [x] 9. `buildAudioSources`: consumir el layout — slots fijos T1/T2/T3 (game y mic siempre
       reservados en apps+separadas, aunque el juego esté sin audio → pista muda), apps a
       T4+, pistas creadas y nombradas desde `layout.tracks`, `recording/replay.mixer` =
       `layout.mixer`.

## Pieza 3 — Nombres en el MP4 (remux ffmpeg)

- [x] 10. Util `remuxAudioTrackNames(file, tracks)` con ffmpeg-static: `-map 0 -c copy` +
       `-metadata:s:a:N title/handler_name`, escritura a tmp y rename atómico; best-effort
       (si falla, el clip queda íntegro sin nombres). Test del armado de args.
- [x] 11. Enganchar en el manager tras la señal `wrote` (grabación manual y clip del replay),
       solo cuando `layout.named`; usar los nombres del layout vigente.

## Verificación (gates)

- [x] Type-check · Lint · Tests verdes.
- [x] E2E máquina real (modo `apps`, juego + mic + 2 apps con tono): `ffmpeg` lista 5 pistas
      con `handler_name` `default/game/mic/<app>/<app>` en orden; pista 1 = mezcla, cada rol
      aislado (`-map 0:a:n` + `volumedetect`).
      - 2026-07-11 19:09 (repro `osn-min/repro-layout.js`, tono ruteado al rol `game`):
        5 pistas `default/game/mic/opera/chrome`; `a:0` (mezcla) −19.7 dB y `a:1` (game)
        −19.7 dB con el tono; `a:2/a:3/a:4` (mic/opera/chrome) −91 dB → aislamiento OK.

## Cierre

- [x] Aprobación del owner (plan aprobado y merge pedido, 2026-07-11)
- [x] Merge a `main` con `--no-ff` y rama borrada
- [x] `roadmap.md` actualizado
