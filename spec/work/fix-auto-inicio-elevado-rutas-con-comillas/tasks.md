# Tasks — El auto-inicio elevado fallaba con una ruta del portable que lleva ’

## Tests unitarios (obligatorios; primero, en rojo)

- [x] `powershellElevatedArgs`: el `-Command` no contiene la ruta ni comillas simples con ’ ‘ ‚ ‛ y `'`;
      la línea llega intacta en `env`.
- [x] `powershellRelaunchElevatedArgs`: ídem para la ruta y los argumentos.
- [x] `env` hereda el entorno de origen y no lo muta; por defecto parte de `process.env`.
- [x] PowerShell real (Windows): el script parsea y `Start-Process` recibe ruta y argumentos intactos.
- [x] PowerShell real: el exit code se propaga (3 → 3; fallo de Start-Process → 1).
- [x] `ElevatedAutoLaunch.setEnabled` pasa el `env` a `run`.

## Implementación

- [x] 1. `powershellElevatedArgs` → `{ args, env }` con `$env:GAMECLIP_SCHTASKS_ARGS`.
- [x] 2. `powershellRelaunchElevatedArgs` → `{ args, env }` con `$env:GAMECLIP_RELAUNCH_EXE` / `_ARG_n`.
- [x] 3. `ElevatedLaunchDeps.run(args, env)`, `realRun` y `realRelaunch` pasan `env` a `spawn`.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`)
- [x] Comprobación real: PowerShell parsea el script con una ruta con ’ y `Start-Process` real (sin
      `-Verb RunAs`) arranca un hijo que recibe los mismos argumentos que con el array literal.

## Cierre

- [x] Aprobación del owner
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado (lo hace quien integra la tanda: la lista de pendientes
      es compartida entre ramas y el cambio chocaría)
