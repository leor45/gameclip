# Spec — Clips duplicados en la biblioteca

**Tipo:** Fix
**Rama:** `fix/biblioteca-clips-duplicados`
**Fecha:** 2026-07-11

## Problema / Objetivo

La biblioteca muestra dos veces el mismo clip (mismo título, misma miniatura, misma duración)
aunque en disco solo hay un archivo. No son dos tarjetas de un mismo registro: son **dos filas**
del catálogo apuntando al mismo archivo.

### Causa raíz

El catálogo indexa la ruta **tal como la escribe cada camino de alta**, y hay dos que no coinciden
en el separador:

| Alta | Ruta que se guarda | Origen del string |
|---|---|---|
| Al guardar el clip (replay/grabación) | `D:\Descargas\Video\GameClip/clip.mp4` | `lastFile()` de libobs, que pega su carpeta de salida con `/` |
| Al reconciliar con el disco (arranque) | `D:\Descargas\Video\GameClip\clip.mp4` | `join(outputDir, name)` de Node, con `\` |

`clips.file_path` es `UNIQUE` y `getByPath` compara **por igualdad de string**, así que las dos
formas de la misma ruta no se reconocen entre sí: `reconcile()` no encuentra el clip que la
captura ya había registrado y lo inserta otra vez como `source: 'scan'`.

Verificado en la DB real del usuario (`userData/library.db`):

```
id 107 · D:\Descargas\Video\GameClip/2026-07-11 19-14-42.mp4 · source recording
id 108 · D:\Descargas\Video\GameClip\2026-07-11 19-14-42.mp4 · source scan
```

De ahí el "a veces": solo se duplican los clips **grabados por la app** (los que pasan por
`registerSavedClip`), y recién en el primer `reconcile()` posterior — normalmente el siguiente
arranque. Un clip que solo entró por escaneo nunca se duplica. No lo introdujo una tarea
concreta: el bug convive desde la Fase 4, cuando aparecen las dos vías de alta.

Efecto colateral: cada duplicado arrastra su propia miniatura y su propio `size_bytes`, así que el
archivo se **cuenta dos veces** en el uso de disco de Almacenamiento (y en el auto-borrado por
límite de GB).

## Alcance

**Dentro:**

- Canonicalizar la ruta en la frontera del catálogo: toda alta y toda búsqueda por ruta pasan por
  la misma forma normalizada (ruta absoluta resuelta, separadores nativos).
- Comparación de rutas **insensible a mayúsculas** (Windows lo es): evita el mismo bug si la
  carpeta de clips se reconfigura con otra capitalización.
- Migración que **canonicaliza las filas existentes y fusiona los duplicados ya creados**: queda un
  registro por archivo, con los datos más ricos (miniatura, duración, favorito, etiquetas, juego)
  y la miniatura huérfana del descartado se borra.
- Test de regresión que reproduce el bug primero (alta con `/` + reconcile con `\` → un clip).

**Fuera (explícito):**

- Detectar duplicados por contenido (el mismo video guardado con dos nombres distintos).
- Enlaces simbólicos, rutas UNC de red y volúmenes montados: se resuelve la ruta, no se sigue el
  enlace.
- Rediseñar la reconciliación (sigue siendo el escaneo por carpeta de hoy).

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] Test de regresión: registrar un clip con la ruta que da libobs (`dir/clip.mp4`) y reconciliar
      la carpeta (`dir\clip.mp4`) deja **un** clip en el catálogo, no dos.
- [ ] Registrar el mismo archivo con distinta capitalización tampoco crea un segundo registro.
- [ ] Al abrir la app con la DB real (dos filas para `2026-07-11 19-14-42.mp4`), la biblioteca
      muestra **una** tarjeta, conservando su miniatura y su duración.
- [ ] El uso de disco de Almacenamiento deja de contar ese archivo dos veces.
- [ ] La miniatura del registro descartado no queda huérfana en `userData/thumbnails`.
- [ ] Gates verdes: `npm run typecheck`, `npm run lint`, `npm run test`.
