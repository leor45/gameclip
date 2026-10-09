# Spec — Ediciones de Ajustes que se pierden (durante un guardado y al renombrar con Enter)

**Tipo:** Fix
**Rama:** `fix/ajustes-ediciones-perdidas`
**Fecha:** 2026-10-09

## Problema / Objetivo

Auditoría bug-hunter C, dos hallazgos Low del mismo síntoma: **algo que editas en Ajustes no llega a
guardarse**.

- **C4-BUG-2 — editar mientras se guarda.** Guardar un ajuste de captura espera al rebuild del main
  (segundos) y los campos siguen editables. Lo que se cambia en esa espera se revierte al volver el
  guardado; y si se re-edita una clave que ya iba en el guardado, deja de estar marcada como pendiente
  y el siguiente «Guardar» no la manda.
  **Causa raíz:** `useCaptureSettings.save()` hace `setSettings(applied)` —reemplaza el estado local
  entero— y borra de `editadas` todas las claves enviadas, se hayan vuelto a tocar o no.
- **C4-BUG-4 — renombrar un juego manual con Enter** (Ajustes → Grabación). Se guarda sin el nombre
  nuevo aunque diga «Ajustes guardados ✓», y el nombre se pierde al salir de la sección.
  **Causa raíz:** el campo «Renombrar…» no es controlado y aplica el nombre en `onBlur`; dentro del
  `<form>`, Enter dispara el envío antes del blur y `save()` manda el estado sin el nombre.

## Alcance

**Dentro:**
- `useCaptureSettings`: contador de ediciones por clave; tras guardar, solo se da por guardado lo que no
  se tocó durante la espera, el resto conserva su valor local y sigue pendiente; «guardado» solo si no
  queda nada pendiente.
- `Grabacion.tsx`: Enter en «Renombrar…» confirma el nombre (como el blur) y no envía el formulario.
- Tests de regresión.

**Fuera (explícito):**
- Deshabilitar los campos durante el guardado.

## Criterios de aceptación

- [ ] Editar otra clave, o re-editar la enviada, durante un guardado: los valores se mantienen, siguen
      pendientes y el siguiente guardado los manda.
- [ ] Enter en el nombre de un juego manual no envía el formulario; al guardar, va el nombre nuevo.
- [ ] Suite verde.
