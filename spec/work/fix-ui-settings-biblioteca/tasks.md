# Tasks — Pulido de UI: Ajustes + card de Biblioteca

## Tests

- [x] `formatFileSize`: B/KB/MB/GB, 0, negativos, límites de redondeo.
- [x] Card muestra el tamaño del archivo (vídeo y captura).
- [x] Los cinco botones de la card tienen `title` (tooltip).
- [x] El botón de eliminar es el basurero (svg) y conserva su `aria-label`.
- [x] Regresión CSS: `.audio-app-add label` tiene `min-width: 0`.

## Implementación

- [x] 1. `formatFileSize` en `@shared/library`.
- [x] 2. `ClipCard`: línea de tamaño, `title` en botones, SVG de basurero rojo.
- [x] 3. `styles.css`: fix `.audio-app-add` (min-width:0 + wrap), coherencia de campos, `.clip-size`,
      estilo del basurero de la card.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 604 pasan
- [x] Bump de versión a 0.7.2 en `package.json`.
- [ ] Comprobación manual: Ajustes › Grabación no desborda; card muestra tamaño/tooltips/basurero.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
