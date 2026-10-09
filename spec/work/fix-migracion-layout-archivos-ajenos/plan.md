# Plan — La migración del layout viejo mueve y renombra archivos del usuario

> **Este plan es un contrato.** Aprobado con el resto de la tanda C («sí, adelante»).

## Enfoque

1. `src/main/library/migrate-layout.ts`: `if (clip.source === 'scan') continue;` tras el filtro de la
   raíz, con el porqué en el doc de la función.

## Archivos / módulos afectados

- `src/main/library/migrate-layout.ts` (+ `src/main/__tests__/migrate-layout.test.ts`)
- `spec/constitution/roadmap.md`

## Decisiones y alternativas consideradas

- **Filtrar por `source`** frente a una marca persistida de «migración hecha»: la marca también
  protegería, pero exige un ajuste o tabla nuevos; el origen ya está en cada fila y expresa justo la
  regla («solo lo que creó GameClip»). Los clips de la app anteriores a la Fase 10 se registraron
  como `replay`/`recording`, así que siguen migrándose.

## Riesgos

- Un clip de GameClip catalogado por el escaneo (catálogo perdido y re-escaneado) suelto en la raíz
  ya no se reorganiza; se queda donde está y se sigue viendo en la biblioteca.

---

**Estado:** ✅ aprobado el 2026-10-09
