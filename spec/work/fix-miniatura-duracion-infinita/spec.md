# Spec — Un vídeo sin duración en la cabecera deja las miniaturas en bucle

**Tipo:** Fix
**Rama:** `fix/miniatura-duracion-infinita`
**Fecha:** 2026-10-09

## Problema / Objetivo

Auditoría bug-hunter C, C4-BUG-1 (Low). Un vídeo cuyo `<video>.duration` es `Infinity` (MKV cortado
por un cierre brusco, MP4 fragmentado) se reextrae sin fin y bloquea las miniaturas de los clips que
van detrás en la biblioteca.

**Causa raíz:** `useThumbnailer` saca la miniatura en el 10 % del clip (`min(3, ∞) = 3 s`) y manda
`durationSeconds: Infinity`. `LibraryManager.setClipMedia` descarta con razón la duración no finita,
así que el clip sigue «pendiente» (`durationSeconds` null). Como sí hubo miniatura, el hook no lo
marca como fallido; `setMedia` emite `changed`, la lista se recarga y el mismo clip vuelve a ser el
primer pendiente.

## Alcance

**Dentro:**
- `useThumbnailer`: una extracción sin duración finita cuenta como no reintentable en la sesión
  (igual que ya pasa con «duración sí, miniatura no»). La miniatura se guarda igual.
- Test de regresión.

**Fuera (explícito):**
- Calcular la duración real de esos archivos (exigiría sondearlos con ffprobe en el main).

## Criterios de aceptación

- [ ] Con un clip que devuelve duración `Infinity`, una recarga de la lista no lo vuelve a extraer y
      el siguiente pendiente recibe su miniatura.
- [ ] Suite verde.
