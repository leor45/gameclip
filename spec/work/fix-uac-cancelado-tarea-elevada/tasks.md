# Tasks — Cancelar el UAC del auto-inicio elevado se daba por aplicado

## Tests unitarios (obligatorios; primero, en rojo)

- [x] Regresión: el comando de `powershellElevatedArgs` va en `try`, con `-ErrorAction Stop` y
      `catch { exit 1 }`.

## Implementación

- [x] 1. `powershellElevatedArgs` con `try/catch` y `-ErrorAction Stop`.

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes
- [x] Comprobación real (2026-10-09): el comando generado con un exe inexistente sale con 1 (antes
      0); con un proceso que sale con 3, propaga 3.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
