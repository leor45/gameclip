# Tasks — Adelgazar el portable (arranque lento)

## Implementación

- [x] `electron-builder.yml`: excluir `.pdb` (336 MB), el navegador embebido de OBS —CEF,
      `obs-browser`, `icudtl.dat`, `.pak`— (265 MB) y `mediasoup` (14 MB).
- [x] `src/main/paths.ts`: `ffmpegPath()` usa el `ffmpeg.exe` de osn; fuera `ffmpeg-static` (79 MB).
- [x] `build/TERCEROS.txt` + `extraResources`: osn no trae ningún archivo de licencia, así que el
      aviso GPL de libobs y FFmpeg lo mantenemos nosotros.
- [x] `src/main/temp-cleanup.ts` + un paso más en `teardown()`: al cerrar se borran las carpetas que
      dejaron las ejecuciones anteriores.
- [x] `unpackDirName: GameClip-${version}`: la carpeta de descompresión pasa a tener nombre fijo (una
      sola, reutilizada, en vez de una aleatoria por ejecución).

## Tests unitarios (obligatorios)

- [x] `temp-cleanup.test.ts` (11 casos). Los que importan de verdad son los negativos: **no** toca el
      `ns*.tmp` de otro instalador, **no** toca el payload de otra app de Electron, **no** toca la
      carpeta en uso ni el staging de la ejecución en curso.
- [x] Casos positivos: payload completo, payload **a medio borrar** (el launcher deja `resources/`
      atrás), staging del extractor y carpetas `.borrar` de un intento fallido.

## Verificación (gates)

- [x] Type-check · lint · tests (414) verdes.
- [x] **La captura sigue funcionando con el `.exe` recortado**: F8 → clip 1080p60 con sus 5 pistas de
      audio nombradas (`default/game/mic/Discord/opera`), o sea que el remux con el ffmpeg de osn
      también corre.
- [x] Medición antes/después (ver el spec): 190 → 93 MB de `.exe`; 738 → 418 MB de payload;
      ~16 → ~13,5 s de arranque.
- [x] Limpieza verificada con basura fabricada con la forma exacta de la real: borra las cuatro
      carpetas nuestras y **deja intactas** las dos ajenas.
- [x] Tres ciclos abrir/cerrar seguidos: no queda basura acumulándose.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada
- [x] `spec/constitution/roadmap.md` actualizado
