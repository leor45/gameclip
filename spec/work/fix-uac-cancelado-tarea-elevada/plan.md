# Plan — Cancelar el UAC del auto-inicio elevado se daba por aplicado

> **Este plan es un contrato.** Aprobado con el resto de la tanda C («sí, adelante»).

## Enfoque

1. `src/main/elevated-launch.ts`: `try { $p = Start-Process … -ErrorAction Stop; exit $p.ExitCode }
   catch { exit 1 }`. `ElevatedAutoLaunch.setEnabled` ya traduce un exit code distinto de 0 en
   `false`, y el llamador ya revierte el ajuste con `false`.

## Archivos / módulos afectados

- `src/main/elevated-launch.ts` (+ `src/main/__tests__/elevated-launch.test.ts`)
- `spec/constitution/roadmap.md`

## Decisiones y alternativas consideradas

- **`-ErrorAction Stop` + `catch`** frente a comprobar `$p -eq $null`: el `catch` cubre cualquier
  fallo de Start-Process, no solo el de `$p` nulo.

## Riesgos

- Ninguno: con UAC aceptado el comando se comporta igual (comprobado: un proceso que sale con 3
  propaga 3).

---

**Estado:** ✅ aprobado el 2026-10-09
