# Plan — La caché del índice de juegos ignora los cambios de reglas y el «Volver a escanear»

> **Este plan es un contrato.** Aprobado con el resto de la tanda C («sí, adelante»).

## Enfoque

1. `src/main/games/scan.ts`: `export const SCAN_RULES_VERSION = 2` con la instrucción de subirla al
   tocar `MAX_SCAN_DEPTH`, `CARPETAS_IGNORADAS` o `EXES_IGNORADOS`.
2. `src/main/games/index.ts`: `huellaDe` antepone `reglas:<versión>`; `refresh({ force })` encadena el
   forzado detrás del refresco en curso; `doRefresh(force)` salta la caché si `force`.
3. `src/main/index.ts`: `refreshGameIndex(force = false)`; el `rescan` del IPC pasa `true`.

## Archivos / módulos afectados

- `src/main/games/scan.ts`, `src/main/games/index.ts` (+ `src/main/games/__tests__/index.test.ts`)
- `src/main/index.ts`
- `spec/constitution/roadmap.md`

## Decisiones y alternativas consideradas

- **Versión manual de las reglas** frente a un hash de las regex: el hash cambiaría con cualquier
  retoque cosmético y no es más seguro que una constante con su instrucción al lado.
- **Re-indexado una sola vez al actualizar:** cuesta el escaneo del primer arranque (el mismo que la
  primera instalación) y luego vuelve a la caché.

## Riesgos

- Ninguno relevante: el primer arranque tras actualizar re-escanea en segundo plano, como ya hace
  cuando cambia la lista de juegos.

---

**Estado:** ✅ aprobado el 2026-10-09
