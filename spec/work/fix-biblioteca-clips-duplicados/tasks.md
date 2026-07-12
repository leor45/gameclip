# Tasks — Clips duplicados en la biblioteca

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. **Test de regresión primero (rojo):** alta con la ruta de libobs (`dir/clip.mp4`) +
      `reconcile(dir)` → daba 2 clips, debe dar 1.
- [x] 2. `src/main/library/clip-path.ts`: `canonicalClipPath` (resolve + separadores nativos) y
      `clipPathKey` (clave de comparación en minúsculas; NTFS ignora mayúsculas).
- [x] 3. `ClipsRepository`: canonicalizar en `insert`, buscar con `COLLATE NOCASE` en `getByPath`.
- [x] 4. Migración #3 (función, no SQL suelto): canonicalizar rutas y **fusionar** los duplicados
      ya creados; migración #4: índice único case-insensitive sobre `file_path`.
- [x] 5. `LibraryManager`: borra al arrancar las miniaturas que la fusión dejó huérfanas.

## Tests unitarios (obligatorios)

Camino feliz **y** casos borde. Si es un Fix: el test de regresión va primero (rojo → verde).

- [x] `library-manager.test.ts` — regresión: ruta de libobs + reconcile → 1 clip; la misma ruta con
      otra capitalización → 1 clip.
- [x] `clips-repository.test.ts` — guarda la ruta canónica y la encuentra escrita de cualquier
      forma; la DB rechaza el duplicado; migración que fusiona las dos filas reales conservando
      miniatura, duración, favorito, juego y etiquetas de ambas.
- [x] `storage-manager.test.ts` — el archivo duplicado deja de contarse dos veces en el uso de disco.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 301
- [x] Comprobación manual: migración corrida sobre una **copia** de la `library.db` real del owner
      → sus 3 filas (2 archivos) quedan en 2 clips, se conserva el id 107 con su miniatura y
      duración, y `thumbnails/108.jpg` queda listada como huérfana para borrar.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
