# Spec — Evento `settings:changed` (ajustes en tiempo real)

**Tipo:** Feature
**Rama:** `feature/settings-changed-evento`
**Fecha:** 2026-07-11

## Problema / Objetivo

Los ajustes de captura solo viajan main → renderer cuando alguien los **pide**
(`capture:get-settings`). No hay push. Consecuencia inmediata: el indicador de almacenamiento del
sidebar (entregado en `feature/sidebar-almacenamiento`) lee `storageLimitGb` al montar, así que si
el usuario cambia el límite en Ajustes y se queda ahí, el anillo sigue mostrando el límite viejo
hasta que el catálogo cambie por otro motivo.

Objetivo: que el main **empuje** los ajustes a todas las ventanas cuando cambian, igual que ya hace
con el estado de captura (`capture:status-changed`) y con el catálogo (`library:changed`), y que el
sidebar se actualice al instante.

## Alcance

**Dentro:**

- Evento push `settings:changed` (main → renderer) con los `CaptureSettings` completos, emitido
  cada vez que se guardan ajustes (desde la UI o desde cualquier otro camino del main que los
  toque).
- API en el preload: `capture.onSettingsChanged(listener)` → función de desuscripción, igual que
  las suscripciones existentes.
- El `StorageIndicator` se suscribe: cambiar el límite en Ajustes se refleja en el anillo sin
  navegar ni recargar.

**Fuera (explícito):**

- Reconciliar el formulario de Ajustes con el evento (si el usuario tiene cambios sin guardar en
  otra ventana, no se pisan): hoy hay una sola ventana de ajustes y el formulario es el que emite.
- Emitir el evento por cambios que no pasen por el store de ajustes.

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] Guardar ajustes emite `settings:changed` con los ajustes ya normalizados a todas las ventanas.
- [ ] Cambiar el límite de almacenamiento en Ajustes actualiza el anillo del sidebar en el acto,
      sin tocar el catálogo ni navegar.
- [ ] La suscripción se limpia al desmontar (no quedan listeners colgados).
- [ ] Gates verdes: `npm run typecheck`, `npm run lint`, `npm run test`.
