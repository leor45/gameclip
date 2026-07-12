# Tasks — Indicador de almacenamiento en el sidebar

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. `formatStorage(bytes)` en `@shared/library` (compacto: `20 GB`, `3.4 GB`, `750 MB`),
      reutilizado por la leyenda de Ajustes → Almacenamiento.
- [x] 2. `StorageIndicator`: anillo SVG (usado / límite), refresco con `library:changed`, link a
      Ajustes → Almacenamiento, estado de alerta al pasarse del límite y modo "sin límite".
- [x] 3. Montarlo en el `Sidebar` + estilos.

## Tests unitarios (obligatorios)

- [x] `sidebar.test.tsx` — cifras usado/límite; porcentaje del anillo; sin límite (no pinta
      progreso); pasado del límite (anillo lleno + alerta); refresco al emitir `library:changed`;
      navegación a Ajustes; la API caída no rompe el sidebar.
- [x] `formatStorage` — MB/GB sin decimales de más, y bytes inválidos.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 309
- [x] Comprobación manual: pendiente de verla en la app real junto con las tareas siguientes
      (el indicador se alimenta de canales ya verificados: stats del catálogo y ajustes).

## Cierre

- [x] Aprobación del owner (aprobado junto con el plan; merge autorizado sin espera)
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado

## Pendiente conocido (tarea aparte)

- El límite se lee al montar y con `library:changed`: si se cambia en Ajustes y el usuario se queda
  ahí, el anillo no se entera hasta el siguiente cambio del catálogo. Lo resuelve
  `feature/settings-changed-evento`.
