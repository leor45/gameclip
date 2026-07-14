# Spec — Pulido de UI: Ajustes (layout roto) + card de Biblioteca

**Tipo:** Fix
**Rama:** `fix/ui-settings-biblioteca`
**Fecha:** 2026-07-14

## Problema / Objetivo

Dos zonas de UI a pulir, manteniendo el estilo actual (paleta GameClip):

1. **Ajustes › Grabación › Detección de juegos** se rompe: el formulario de alta de juego
   (`.audio-app-add`) **se estira a la derecha** y desborda la columna.
   **Causa raíz:** `.audio-app-add label { flex: 1 }` no lleva `min-width: 0`, y el `<select>`
   "Proceso en ejecución" tiene opciones muy largas (`ejecutable — título de ventana`). El ancho
   mínimo de contenido de un flex-item con `min-width: auto` impide que encoja, así que la fila
   crece hasta salirse del panel. Además conviene dar coherencia de anchos al resto de Ajustes.

2. **Biblioteca › card de clip**: falta información y pulido:
   - Bajo el nombre y la línea de juego·fecha (la opaca), **no se muestra el tamaño del archivo**.
   - Los **iconos de acción** (★ ✎ ✂ ⌂ ✕) no tienen tooltip que diga qué hacen.
   - El botón de eliminar es una **✕**; se quiere un **basurero rojo** (como el de Ajustes › Audio).

## Alcance

**Dentro:**
- Arreglar `.audio-app-add` (añadir `min-width: 0` + permitir wrap) para que no desborde, y dar
  coherencia de anchos/espaciado a los campos de Ajustes sin cambiar el lenguaje visual.
- En la card: añadir una línea con el **tamaño del archivo** (KB/MB/GB) bajo la meta, para vídeos y
  capturas.
- Añadir `title` (tooltip) a los cinco botones de acción de la card.
- Sustituir la **✕** de eliminar por un **icono de basurero rojo** (reutilizando el patrón de
  `.audio-app-trash`).
- Formateador puro `formatFileSize(bytes)` (B/KB/MB/GB) con test.

**Fuera (explícito):**
- No es un rediseño: se mantiene la paleta, tipografías y componentes. Solo se corrigen roturas y
  se homogeneízan anchos/espaciados.
- No se cambia la lógica de la biblioteca, el borrado, ni los datos (el `sizeBytes` ya existe).
- No se tocan otras vistas (editor, overlay, auth).

## Criterios de aceptación

- [ ] El formulario de alta de juego no desborda la columna aunque el `<select>` tenga procesos con
      títulos largos; los campos encogen y/o envuelven con orden.
- [ ] Cada card muestra el tamaño del archivo bajo la línea de juego·fecha, formateado (p. ej.
      `12.4 MB`, `340 KB`), tanto para vídeos como para capturas.
- [ ] Los cinco iconos de la card tienen tooltip al pasar el cursor (favorito, renombrar, editar,
      abrir carpeta, eliminar).
- [ ] El botón de eliminar es un basurero rojo, con su `aria-label` intacto.
- [ ] Type-check, lint y tests verdes; test de `formatFileSize` y del render de la card
      (tamaño + tooltips + basurero), más regresión CSS del `min-width: 0` en `.audio-app-add`.
