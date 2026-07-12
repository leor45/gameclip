# Tasks — Filtro "Escritorio" en la biblioteca

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. `ClipsQuery.withoutGame` + `DESKTOP_FILTER_VALUE` (centinela del desplegable) en
      `@shared/library`.
- [x] 2. `ClipsRepository.list`: `game IS NULL` cuando el criterio está activo, con precedencia
      sobre `game`.
- [x] 3. `sanitizeQuery` (IPC) acepta el criterio nuevo.
- [x] 4. Biblioteca: opción "Escritorio" en el desplegable; el centinela se traduce en el renderer
      y al catálogo le cruza `withoutGame`, no la cadena.

## Tests unitarios (obligatorios)

- [x] `clips-repository.test.ts` — solo los clips sin juego; un juego llamado "Escritorio" no se
      confunde con el criterio; `withoutGame` tiene precedencia sobre `game`; se combina con
      favoritos y búsqueda; sin criterio se listan todos.
- [x] `biblioteca.test.tsx` — elegir "Escritorio" consulta con `withoutGame: true` y sin `game`;
      elegir un juego sigue consultando por nombre.

> `sanitizeQuery` es privada del módulo IPC y no hay arnés de tests para los handlers: queda
> cubierta por los tests del repositorio y de la vista (el criterio viaja tipado de punta a punta).

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 341
- [ ] Comprobación manual en la app: el desplegable muestra "Escritorio" y filtra tus dos clips
      (que hoy no tienen juego en el catálogo).

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
