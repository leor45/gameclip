# Spec — Ajustes que se pierden o se pisan

**Tipo:** Fix
**Rama:** `fix/ajustes-se-pisan`
**Fecha:** 2026-10-08

## Problema / Objetivo

Dos fallos de la misma familia —un ajuste guardado que no llega a aplicarse— encontrados en la
auditoría bug-hunter del 2026-10-08.

### 1. Ajustes guardados durante una grabación nunca se aplican (BUG-4)

**Causa raíz:** `CaptureManager.setSettings` (`src/main/capture/manager.ts`) omite el rebuild del
pipeline si el estado es `recording`, pero **no** marca `pendingRebuild`. Al parar,
`settleAfterRecording` solo reconstruye si `pendingRebuild` o si cambió el perfil, así que calidad,
encoder, fps, micrófono, monitor… siguen con los valores viejos hasta otro rebuild por otra causa.

### 2. Cada sección de Ajustes pisa los cambios hechos por otras vías (BUG-15)

**Causa raíz:** `useCaptureSettings` (`src/renderer/views/ajustes/useCaptureSettings.ts`) carga los
ajustes **una vez** al montar la sección y, al guardar, manda el objeto **entero**. No escucha
`settings:changed`. Cualquier ajuste cambiado mientras tanto por otra vía vuelve a su valor viejo:

- la duración del clip desde la barra superior (visible también en Ajustes);
- `perfOverlayVisible` con el atajo del overlay (Alt+R);
- la reversión de `autoLaunchElevated` cuando el owner cancela el UAC → el siguiente guardado lo
  reactiva y vuelve a pedir UAC.

**Objetivo:** que un ajuste guardado siempre se aplique, y que guardar una sección solo escriba lo que
se tocó en esa sección.

## Alcance

**Dentro:**
- `setSettings` durante una grabación deja el rebuild pendiente para el final de la grabación.
- `useCaptureSettings` guarda solo los campos editados en la sección y se mantiene al día con
  `settings:changed` en los campos que no se han tocado.

**Fuera (explícito):**
- Evitar que **cualquier** guardado reconstruya el pipeline (p. ej. el atajo del overlay vacía el
  búfer): es un cambio de diseño con su propio spec.
- Fusionar conflictos campo a campo dentro de un mismo objeto (`perfOverlay`): se trata como un campo.

## Criterios de aceptación

- [ ] Grabando, cambiar la calidad y guardar → al parar, el pipeline se reconstruye con la calidad nueva.
- [ ] Con Ajustes abierto, cambiar la duración desde la barra superior y luego guardar la sección → la duración nueva se conserva.
- [ ] Un campo editado en la sección y no guardado no se pisa por un `settings:changed` ajeno.
- [ ] Guardar una sección sin tocar nada no cambia ningún ajuste.
