# Plan — Los ajustes se escriben sin atomicidad

> **Este plan es un contrato.** Aprobado con el resto de la tanda B («arregla los 10»).

## Enfoque

`src/main/capture/settings-store.ts`, sin tocar la API (`load`/`save`):

- `leer(ruta): unknown | null` — parsea un fichero o devuelve null (inexistente/corrupto).
- `load`: `leer(principal) ?? leer(bak)` → `normalizeCaptureSettings`; si vino del `.bak`,
  `console.warn`.
- `save`: `writeFileSync(tmp)`, luego si `leer(principal)` no es null `copyFileSync(principal, bak)`
  (best-effort), y `renameSync(tmp, principal)`.

## Archivos / módulos afectados

- `src/main/capture/settings-store.ts`
- `src/main/__tests__/settings-store.test.ts`
- `spec/constitution/roadmap.md`

## Decisiones y alternativas consideradas

- **tmp + rename** (elegida): es el patrón que el repo ya usa para MP4; atómico en NTFS dentro del
  mismo volumen.
- **`.bak` además del rename**: cubre que el propio rename se corte o que algo externo corrompa el
  fichero (antivirus, sincronización en la nube de `%APPDATA%`).

## Riesgos

- Un `.bak` de una versión anterior puede traer un ajuste viejo tras una recuperación: aceptable
  frente a perderlos todos. `normalizeCaptureSettings` lo valida igual.

---

**Estado:** ✅ aprobado el 2026-10-08
