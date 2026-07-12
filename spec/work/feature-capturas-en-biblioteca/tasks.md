# Tasks — Capturas de pantalla en la biblioteca

## Implementación

- [x] 1. `@shared/library`: `MediaKind`, `mediaKindForFile(path)`, `Clip.kind`, `StorageStats.screenshotsBytes`.
- [x] 2. `@shared/clip-naming`: `gameFromFolderName(folder)` — el inverso de `clipBaseName`, con la lista curada.
- [x] 3. Repositorio: migración #5 (`kind` + backfill por extensión); `kind` derivado en `insert` y leído en `toClip`.
- [x] 4. `LibraryManager.reconcile`: indexa imágenes además de videos e infiere el juego desde la carpeta.
- [x] 5. `takeAndRegisterScreenshot`: la captura se cataloga al tomarla (hotkey global y botón de la UI).
- [x] 6. `StorageManager`: `screenshotsBytes` en las stats; `enforceLimit` cuenta las capturas pero no las borra.
- [x] 7. `useThumbnailer`: miniatura de imagen (`<img>` → canvas), con duración 0 para que no quede pendiente.
- [x] 8. `ClipCard`: sin botón de editor, sin preview en hover, badge "Captura"; el borde del hover se mantiene.
- [x] 9. `ClipPlayer`: `<img>` cuando el clip es una imagen.
- [x] 10. `StorageIndicator` y Ajustes → Almacenamiento: las capturas suman al uso (segmento y leyenda propios).

## Tests unitarios (obligatorios)

- [x] Repositorio: `kind` lo decide la extensión, no el `source`.
- [x] Repositorio: el backfill de la migración marca como imagen lo ya catalogado con extensión de imagen.
- [x] Manager: el escaneo indexa las capturas de `Capturas/` además de los videos.
- [x] Manager: el juego se infiere de la carpeta (`terraria/` → Terraria; `Desktop/` → sin juego).
- [x] Manager (borde): un archivo suelto en la raíz no tiene juego.
- [x] Manager: una captura recién tomada queda catalogada como imagen y con su juego.
- [x] Storage: las capturas van a `screenshotsBytes`, no a `clipsBytes`.
- [x] Storage (borde): la captura más vieja cuenta para el límite pero no se borra; cae el video más viejo.
- [x] Biblioteca: la tarjeta de una captura no ofrece editor y muestra "Captura" en vez de duración.
- [x] Biblioteca (borde): el hover no monta preview sobre una captura.
- [x] Biblioteca: el visor muestra `<img>`, no un reproductor.
- [x] Sidebar: el anillo suma las capturas al espacio usado.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 361
- [ ] Comprobación manual: tomar una captura con la hotkey y verla aparecer en la biblioteca sin
      reiniciar, filtrable por su juego y por "Escritorio".

## Cierre

- [x] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
