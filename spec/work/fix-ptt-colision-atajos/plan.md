# Plan — El push-to-talk se puede poner en una tecla que ya es atajo

> **Este plan es un contrato.** Aprobado con el resto de la tanda C («sí, adelante»).

## Enfoque

1. `src/shared/hotkeys.ts`: `hotkeyReservedByPtt` recorre `HOTKEY_ACTIONS` con `isPttReserved`, así
   que hereda sus reglas (la tecla suelta choca; `Ctrl+F8` no; vale para Mouse4/5).
2. `src/renderer/views/ajustes/Audio.tsx`: `<option disabled>` con «F8 — atajo de «Guardar clip»»;
   `bloqueo` de `SeccionForm` si `pttEnabled` y la tecla guardada choca.
3. `src/renderer/views/ajustes/Atajos.tsx`: `restablecer()` salta los defaults reservados y deja el
   motivo en el aviso de rechazo.

## Archivos / módulos afectados

- `src/shared/hotkeys.ts` (+ `src/shared/__tests__/hotkeys.test.ts`)
- `src/renderer/views/ajustes/Audio.tsx` (+ `src/renderer/__tests__/ajustes.test.tsx`)
- `src/renderer/views/ajustes/Atajos.tsx` (+ `src/renderer/__tests__/atajos.test.tsx`)
- `spec/constitution/roadmap.md`

## Decisiones y alternativas consideradas

- **Bloquear solo con el PTT activo:** con el PTT apagado el selector está deshabilitado y no hay
  choque en tiempo de ejecución; bloquear entonces dejaría al usuario sin poder guardar Audio ni
  arreglarlo desde ahí.
- **Contar acciones apagadas** (overlay, capturas): igual que la reserva existente, para que
  encenderlas después no cree el choque.

## Riesgos

- Un usuario con el choque ya guardado verá el aviso al abrir Audio: es lo que se busca.

---

**Estado:** ✅ aprobado el 2026-10-09
