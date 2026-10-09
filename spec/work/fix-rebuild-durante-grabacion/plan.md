# Plan — Un rebuild encolado al empezar a grabar destruye la grabación

> **Este plan es un contrato.** Aprobado con el resto de la tanda C («sí, adelante»).

## Enfoque

1. `src/main/capture/manager.ts`:
   - `queueRebuild()` encola una tarea que, al correr, deja `pendingRebuild = true` si el estado es
     'recording' y si no llama a `rebuildPipeline()`.
   - `setSettings`: la rama de pipeline llama siempre a `queueRebuild()`; la rama de buffer comprueba
     'recording' dentro de su tarea.
   - `displaysChanged`: sin la comprobación previa; `queueRebuild()` decide.

## Archivos / módulos afectados

- `src/main/capture/manager.ts` (+ `src/main/__tests__/capture-manager.test.ts`)
- `spec/constitution/roadmap.md`

## Decisiones y alternativas consideradas

- **Decidir al ejecutar** (como ya hace `applyActiveGame`) frente a poner la guarda en
  `rebuildPipeline`: `rebuildPipeline` también lo usan caminos internos que corren con la grabación
  ya parada (`settleAfterRecording`); la guarda va en la entrada pública encolada.

## Riesgos

- Ninguno nuevo: el aplazamiento a `settleAfterRecording` ya existía para el caso «grabando al
  encolar»; ahora cubre también «grabando al ejecutar».

---

**Estado:** ✅ aprobado el 2026-10-09
