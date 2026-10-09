# Spec — Juegos mal etiquetados en la biblioteca

**Tipo:** Fix
**Rama:** `fix/etiquetado-biblioteca`
**Fecha:** 2026-10-08

## Problema / Objetivo

Dos formas en que la biblioteca le pone a un clip un «juego» que no es (auditoría bug-hunter
2026-10-08; el punto 2 lo confirmó el owner).

### 1. Cambiar la carpeta de clips re-etiqueta los antiguos como `..` o `E:` (BUG-9)

**Causa raíz:** `gameFromPath` (`src/main/library/manager.ts`) toma el primer segmento de
`path.relative(outputDir, filePath)` sin comprobar que el clip esté **dentro** de `outputDir`. Para un
clip de una carpeta de salida anterior, `relative` empieza por `..` (misma unidad) o es la ruta
absoluta (otra unidad, primer segmento `E:`). `relabelGames` recorre todo el catálogo en cada evento
`settings`, así que al cambiar la carpeta todos los clips viejos pasan a `..`/`E:` y aparecen así en el
filtro de juegos.

### 2. Los clips de escritorio se etiquetan con el título de la ventana activa (BUG-10)

**Causa raíz:** `registerSavedClip` hace `game = gameHint ?? títuloDeLaVentanaEnPrimerPlano`. Un clip de
escritorio (y las capturas sin juego) llega con `gameHint = null` y se cataloga con el título de lo que
hubiera delante («YouTube - Google Chrome»), aunque el archivo esté en `Desktop/`. El siguiente
`relabelGames` lo corrige por la carpeta, así que el dato es además inestable. Es un resto de antes de
la detección de juegos y del layout por carpetas.

**Objetivo:** que el juego de un clip salga siempre de la detección o de su carpeta, nunca de basura
de la ruta ni de la ventana activa.

## Alcance

**Dentro:**
- `relabelGames` deja intactos los clips que no están dentro de la carpeta de salida actual.
- `registerSavedClip` usa `gameHint` tal cual (`null` = escritorio); se elimina el fallback por ventana.

**Fuera (explícito):**
- Migrar los clips antiguos a la carpeta nueva.
- Reparar los clips que ya quedaron con `..`/`E:`/títulos de ventana: se corrigen solos en el siguiente
  re-etiquetado si están dentro de la carpeta actual; los de fuera se pueden corregir a mano.
- La lectura de la ventana activa para el auto-cambio de juego (sigue igual).

## Criterios de aceptación

- [ ] Con clips en `D:\Videos\GameClip\Fortnite\` y la carpeta cambiada a `D:\Videos\Nueva`, esos clips conservan «Fortnite».
- [ ] Igual con la carpeta nueva en otra unidad.
- [ ] Un clip de escritorio guardado con Chrome delante se cataloga sin juego.
- [ ] Un clip de juego se sigue catalogando con el juego detectado.
