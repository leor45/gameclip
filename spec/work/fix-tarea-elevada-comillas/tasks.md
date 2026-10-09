# Tasks — La tarea de auto-inicio elevado nunca se reconoce como correcta

## Tests de regresión (primero, en rojo)

- [ ] `elevatedTaskMatches` con el XML real (`<Command>"D:\…\GameClip-0.9.4-portable.exe"</Command>`) → `true`.
- [ ] Ruta con `&amp;` → `true`; distinta capitalización → `true`.
- [ ] Otra versión del portable → `false`.
- [ ] `ensureEnabled` con el XML real no llama a `run` (no eleva).

## Implementación

- [ ] 1. `valorXml` y comparación normalizada en `elevatedTaskMatches`.

## Verificación (gates)

- [ ] Type-check verde (`npm run typecheck`)
- [ ] Lint verde (`npm run lint`)
- [ ] Tests verdes (`npm run test`)
- [ ] Comprobación manual: con el portable empaquetado y el auto-inicio elevado activo, el log ya no recrea la tarea en cada arranque.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
