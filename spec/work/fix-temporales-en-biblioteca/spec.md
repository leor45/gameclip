# Spec — El escaneo de la biblioteca cataloga los temporales de ffmpeg

**Tipo:** Fix
**Rama:** `fix/temporales-en-biblioteca`
**Fecha:** 2026-10-08

## Problema / Objetivo

Auditoría bug-hunter B, BUG-8 (Low). `mediaFilesIn` acepta cualquier fichero por extensión y los
temporales de ffmpeg (`.gameclip-names-<pid>-<ts>.mp4` del remux de nombres, `.gameclip-edit-…mp4`
de «Guardar edit») viven en la **misma carpeta** del clip mientras dura la operación. Si `reconcile`
corre en esa ventana (se dispara en cada `settings` del manager y al arrancar), da de alta el temporal
como clip; al terminar el remux el archivo se renombra y queda una tarjeta fantasma (reproducir falla)
hasta el siguiente `reconcile`.

**Causa raíz:** el escaneo no distingue los temporales propios de los medios del usuario, y el prefijo
`.gameclip-` está duplicado a mano en dos sitios en vez de ser una constante compartida.

## Alcance

**Dentro:**
- `@shared/library`: `TEMP_FILE_PREFIX = '.gameclip-'` e `isTempMediaFile(nombre)`.
- `track-names.ts` y `audio-edit.ts` construyen sus temporales con la constante.
- `library/manager.ts`: `mediaFilesIn` salta los temporales.
- Tests: helper en shared y `reconcile` con un temporal en la carpeta.

**Fuera (explícito):**
- Limpiar temporales huérfanos de ejecuciones anteriores (el remux ya los borra en su `catch`).

## Criterios de aceptación

- [ ] `reconcile` con `.gameclip-names-1-2.mp4` y `.gameclip-edit-3-4.mp4` en la carpeta no añade nada.
- [ ] Los nombres de temporal de `track-names.ts` y `audio-edit.ts` cumplen `isTempMediaFile`.
- [ ] Suite verde.
