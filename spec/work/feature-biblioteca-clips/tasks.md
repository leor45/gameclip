# Tasks — Biblioteca de clips (Fase 4)

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. Alias `better-sqlite3-electron` + script postinstall del prebuild ABI 121; smoke
        de carga del binario bajo Electron.
- [x] 2. Dominio `src/shared/library.ts` (tipos + validación) con tests.
- [x] 3. Repositorio `clips-repository.ts` (migraciones, CRUD, búsqueda, filtros,
        reconciliación) con tests en `:memory:`.
- [x] 4. `LibraryManager` (ingesta, juego en primer plano, thumbnails, delete, eventos).
- [x] 5. Protocolo `gameclip-media://` + wiring en `src/main/index.ts` (ingesta desde
        CaptureManager + reconciliación al arrancar).
- [x] 6. IPC + preload (`window.gameclip.library`).
- [x] 7. Vista Biblioteca (grilla, búsqueda, filtros, player modal, acciones) + estilos.
- [x] 8. Hook `useThumbnailer` (duración + thumbnail → IPC).

## Tests unitarios (obligatorios)

- [x] Dominio: validación de patch (título vacío, tags duplicados/espacios, tipos raros).
- [x] Repositorio: alta/lectura/actualización/borrado; búsqueda por título/juego/tag;
      filtros favoritos y juego; orden por fecha desc.
- [x] Repositorio/manager: reconciliación — agrega archivos nuevos, elimina filas sin
      archivo, conserva metadatos de los existentes.
- [x] Vista: grilla renderiza clips del mock; búsqueda filtra; favorito llama a update;
      eliminar pide confirmación y llama a delete; renombrar dispara update; abrir carpeta.
- [x] Vista: player modal aparece al hacer clic en una tarjeta.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 88 tests
- [x] Comprobación manual: selftest de grabación → clip catalogado en `library.db` con
      juego detectado; reconciliación al arrancar catalogó los clips previos de la Fase 3.

## Cierre

- [x] Aprobación del owner (delegada para esta sesión)
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado (Fase 4 entregada)
