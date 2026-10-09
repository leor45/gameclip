# Tasks — Renderizar con cortes un vídeo sin audio falla en ffmpeg

## Tests unitarios (obligatorios; primero, en rojo)

- [x] `exportAudioSelection`: sin pistas → sin audio; con ganancias; con mute; GIF → nada.
- [x] Regresión: concat de un clip sin audio → `-an` y sin `0:a:0`.

## Implementación

- [x] 1. Helper en `ffmpeg-args.ts`.
- [x] 2. `ipc.ts` lo usa.

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes

## Cierre

- [x] Aprobación del owner
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
