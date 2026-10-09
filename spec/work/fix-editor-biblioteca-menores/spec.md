# Spec — Fallos menores de la biblioteca y del editor avanzado

**Tipo:** Fix
**Rama:** `fix/editor-biblioteca-menores`
**Fecha:** 2026-10-08

## Problema / Objetivo

Tres fallos de severidad baja del renderer, encontrados en la auditoría bug-hunter del 2026-10-08.

### 1. Renombrar un clip pierde lo tecleado (BUG-12)

**Causa raíz:** `ClipCard` realinea el borrador con `useEffect(…, [clip.title, clip.tags])`. `clip.tags`
es un array **nuevo** en cada recarga de la lista (la Biblioteca recarga en cada `library:changed`:
miniaturas generándose, replay guardado…), así que el efecto corre y pisa el título y las etiquetas que
el usuario está escribiendo.

### 2. Un clip ilegible bloquea las miniaturas del resto (BUG-13)

**Causa raíz:** `useThumbnailer` siempre procesa el **primer** clip pendiente. Si su extracción falla
(archivo corrupto, timeout) no hay `setMedia` ni recarga que lo saque de la cola, y en la recarga
siguiente vuelve a elegir el mismo: los pendientes que van detrás no se procesan nunca.

### 3. Ediciones fantasma en clips sin duración catalogada (BUG-14)

**Causa raíz:** el editor avanzado toma como estado base `initialSegments(clip.durationSeconds ?? 0)`.
Si el clip aún no tiene duración (antes de que pase el thumbnailer), la base queda en `[0, 0]` y
`syncVideoInfo` resetea los segmentos a la duración real **sin** actualizar la base: el clip sin tocar
se guarda como «edición sin terminar», «Restablecer» lo deja en 0 s, y un borrador restaurado se pisa
al cargar el vídeo.

**Objetivo:** que ninguno de los tres casos pierda trabajo del usuario ni deje la UI atascada.

## Alcance

**Dentro:**
- `ClipCard`: el borrador solo se realinea si cambia el contenido (no la identidad del array) y nunca
  mientras se está editando.
- `useThumbnailer`: los clips cuya extracción falla se saltan durante la sesión.
- Editor avanzado: al conocer la duración real, la base y lo «ya persistido» pasan a la duración real;
  si se restauró un borrador, sus segmentos no se tocan.

**Fuera (explícito):**
- Reintentar más tarde las miniaturas fallidas dentro de la misma sesión.
- Cambiar el formato de los borradores.

## Criterios de aceptación

- [ ] Editando el título de una tarjeta, un `library:changed` no borra lo escrito.
- [ ] Con un clip corrupto el primero de la lista, el siguiente pendiente recibe su miniatura.
- [ ] Abrir en el editor avanzado un clip sin duración catalogada y no tocar nada → no aparece en «Ediciones sin terminar» y «Restablecer» queda deshabilitado.
- [ ] Un borrador con cortes de un clip sin duración catalogada se restaura con sus cortes.
