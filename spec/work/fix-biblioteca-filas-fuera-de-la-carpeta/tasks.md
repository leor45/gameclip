# Tasks — Filas de la biblioteca que cuelgan de fuera de la carpeta de clips

## Tests unitarios (obligatorios; primero, en rojo)

- [x] `isInsideDir`: mayúsculas, `/` y `\`, barra final, raíz de unidad, UNC, `\\?\`, carpeta hermana con
      el mismo prefijo, la propia carpeta, otra unidad, carpeta vacía.
- [x] Bug 1: el escenario exacto (originales + copias, límite entre una copia y la suma) → no se borra
      nada y los originales siguen en disco; también de punta a punta con el escaneo del guardado.
- [x] Bug 1: con el límite superado dentro, se borran los más viejos de dentro y no los de fuera.
- [x] Bug 1: `getStats` no cuenta lo de fuera (clips, grabaciones y capturas).
- [x] Bug 1: combinado con la unidad de la carpeta de clips sin montar.
- [x] No regresión: sin `outputDir` el límite cuenta todo; carpeta escrita con otra capitalización, `/`
      o barra final; carpeta hermana con prefijo común; carpeta = raíz de unidad; ruta con `\\?\`.
- [x] Bug 6: junction real, catalogado por la ruta real → `reconcile(<junction>)` re-apunta sin duplicar y
      conserva favorito, título, etiquetas, miniatura, duración y pistas muteadas (y el camino inverso).
- [x] Bug 6: el duplicado de la v0.9.7 se fusiona en una fila (la fila antigua de fuera o la de dentro),
      la miniatura sobrante se borra, cuenta como baja; tres caminos al mismo archivo → una fila.
- [x] Bug 6: copias distintas (mismo nombre y tamaño) no se fusionan; hard link sí; archivo vacío, `ino`
      0 y `stat` fallido no identifican; fila de fuera sin pareja se queda como estaba.
- [x] Bug 6: sin filas de fuera no hay `stat` bigint; con una carpeta anterior de clips distintos
      (nombres que no coinciden) tampoco; con nombres que coinciden, solo esas filas y esos archivos;
      el nombre se compara sin distinguir mayúsculas; con la unidad de la salida sin montar, ninguno;
      un fallo al unificar no corta el escaneo. Límite documentado: hard link con otro nombre.
- [x] Bug 6: tras re-apuntar, `relabelGames` deja el juego de la carpeta.
- [x] Repositorio: `mergeRows` (suma de datos, menor id, miniatura huérfana, tres filas, atómica, una
      sola fila, id inexistente); los tests de la migración de rutas siguen verdes sin tocarlos.

- [x] Rescate (en rojo antes): el escenario del revisor con junction, la variante `Z:`/UNC, carpeta
      renombrada, copia con el USB quitado, archivo que aparece a mitad; ambigüedad (dos muertas / dos
      archivos), tamaño distinto, archivo con fila intacto, baja con miniatura, unidad sin montar, fallo
      de `setPath`.
- [x] Fusión: tamaño real, título personalizado, pistas no vacías (y las de la conservada si las dos);
      `setPath` con tamaño; sin `mismoArchivo` todo como antes.
- [x] Identidad: misma fecha de creación fusiona, otra no; `0xFFFFFFFFFFFFFFFF` no identifica.

## Implementación

- [x] 1. `isInsideDir` en `clip-path.ts`.
- [x] 2. `StorageManager`: `clipsDeLaCarpeta` en `getStats` y `enforceLimit`, con TSDoc.
- [x] 3. Repositorio: `fusionarFilas` extraída de la migración y `mergeRows`.
- [x] 4. `reconcile`: filas de fuera, identidad física, re-apuntar/fusionar, contadores y `'changed'`.
- [x] 4b. Prefiltro por nombre de archivo (auditoría: coste de `stat` en NAS en cada `reconcile`).
- [x] 4c. Rescate de filas muertas: bajas al final del escaneo, re-apuntado por nombre + tamaño sin
      ambigüedad (junction deshecho, `Z:`/UNC, carpeta renombrada, copia con el USB quitado).
- [x] 4c2. Sin ver ningún archivo no se borran las muertas de dentro (junction borrado con la app
      cerrada, carpeta inexistente o recreada vacía, renombrada, ilegible); las de fuera sí.
- [x] 4c3. `heldIds()` (ids retenidos por el último escaneo) fuera del uso y del límite en
      `getStats`/`enforceLimit`; `deleteClip` los saca; se vacía cuando la red no actúa.
- [x] 4d. `mergeRows`/`setPath` unifican tamaño real, título personalizado y pistas muteadas.
- [x] 4e. Huella con `birthtimeNs` y sin `0xFFFFFFFFFFFFFFFF`; medido por junction, hard link y UNC.
- [x] 5. Verificadas las vías de alta (todas guardan dentro de la carpeta de clips) y que `relabelGames`
      corre después del escaneo (guardado de Ajustes y arranque).

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes (92 archivos, 1294 tests; 1212 antes).
- [x] Medido con junctions y hard links reales en Windows: `stat` bigint (`dev`/`ino`) da la misma
      identidad por el junction y por la ruta real; una copia (`copyFileSync`) da otra.

## Cierre

- [x] Aprobación del owner
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
