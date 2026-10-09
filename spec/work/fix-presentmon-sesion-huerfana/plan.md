# Plan — Parar PresentMon deja su sesión ETW huérfana

> **Este plan es un contrato.** Aprobado con el resto de la tanda C («sí, adelante»).

## Enfoque

1. `src/main/perf-metrics/presentmon.ts`:
   - `PRESENTMON_SESSION = 'GameClipPerf'` y `presentMonTerminateArgs()`.
   - `PresentMonDeps.closeSession?(exePath, args)`; `stop()` lo llama tras el kill si había proceso
     (en `try/catch`).
   - `realPresentMonCloseSession`: `spawnSync` con `windowsHide`, `stdio: 'ignore'` y `timeout: 3000`;
     `createPresentMonReader` lo inyecta.

## Archivos / módulos afectados

- `src/main/perf-metrics/presentmon.ts` (+ `src/main/__tests__/perf-metrics.test.ts`)
- `spec/constitution/roadmap.md`

## Decisiones y alternativas consideradas

- **Síncrono** frente a lanzarlo en segundo plano: con el overlay apagado y encendido seguido, un
  cierre asíncrono podría llegar después de que el `start()` abra la sesión nueva y matarla. Medido:
  ~35 ms (exit 7 si no hay sesión), así que bloquear es despreciable; el tope de 3 s cubre un cuelgue.
- **Solo si había proceso vivo:** si PresentMon murió solo (típicamente, sin permisos), no hay sesión
  que cerrar y no se lanza nada.

## Riesgos

- Sin elevación PresentMon no abre la sesión ni puede cerrarla: el cierre falla en silencio, igual
  que hoy falla la captura.

---

**Estado:** ✅ aprobado el 2026-10-09
