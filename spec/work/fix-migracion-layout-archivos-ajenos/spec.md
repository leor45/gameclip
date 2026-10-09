# Spec — La migración del layout viejo mueve y renombra archivos del usuario

**Tipo:** Fix
**Rama:** `fix/migracion-layout-archivos-ajenos`
**Fecha:** 2026-10-09

## Problema / Objetivo

Auditoría bug-hunter C, C2-BUG-3 (Low). En cada arranque, cualquier vídeo catalogado que esté suelto
en la raíz de la carpeta de clips se mueve a `Desktop/` y se renombra a `Desktop <fecha>.<ext>`. Desde
la Fase 10 GameClip nunca guarda en la raíz, así que lo único que puede haber ahí son archivos del
usuario: un export guardado en esa carpeta, o todos sus vídeos sueltos si la carpeta de salida es
«Vídeos». Pierden su nombre en disco.

**Causa raíz:** `migrateClipLayout` (pensada para llevar una vez los clips de antes de la Fase 10 al
layout por juego) corre en cada arranque desde `index.ts` y recorre todo el catálogo; el escaneo
(`reconcile`) cataloga cualquier vídeo de la carpeta como `source: 'scan'`, y la migración no
distinguía esos de los clips que creó la app.

## Alcance

**Dentro:**
- `migrateClipLayout`: saltar las filas con `source === 'scan'` (solo migra `replay`/`recording`).
- Test de regresión.

**Fuera (explícito):**
- Devolver su nombre a archivos ya renombrados por versiones anteriores (no hay registro del nombre
  original).
- La migración de capturas del viejo `Capturas/` de la raíz (no está en el catálogo; carpeta propia de
  GameClip).

## Criterios de aceptación

- [ ] Un archivo `scan` suelto en la raíz no se mueve ni se renombra; los clips `replay`/`recording`
      sueltos se siguen migrando como antes.
- [ ] Suite verde.
