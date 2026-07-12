# Tasks — Evento `settings:changed` (ajustes en tiempo real)

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. `IpcEvent.SettingsChanged` + `CaptureApi.onSettingsChanged` en el contrato compartido.
- [x] 2. Puente en `index.ts`: `manager.on('settings')` → `webContents.send` (el manager ya emitía
      ese evento desde la Fase 7; nadie lo escuchaba).
- [x] 3. `onSettingsChanged` en el preload, con el patrón de las suscripciones existentes.
- [x] 4. `StorageIndicator` se suscribe: el catálogo mueve los bytes usados, los ajustes el límite.

## Tests unitarios (obligatorios)

- [x] `sidebar.test.tsx` — al emitir `settings:changed` con un límite nuevo, el anillo muestra el
      límite y el porcentaje nuevos sin que el catálogo cambie; la suscripción se limpia al
      desmontar.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 310
- [x] Comprobación manual: junto con la verificación en la app real de la Fase 10.

## Cierre

- [x] Aprobación del owner (autorizó auto-aprobar y mergear esta tarea concreta)
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
