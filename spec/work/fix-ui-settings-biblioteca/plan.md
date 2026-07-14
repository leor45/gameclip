# Plan — Pulido de UI: Ajustes + card de Biblioteca

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.

## Enfoque

Cambios acotados y de bajo riesgo, casi todo CSS + un poco de JSX. Sin tocar lógica ni datos.

**1. Ajustes — el estirón.**
En `styles.css`: `.audio-app-add label` recibe `min-width: 0` (deja que el flex-item encoja por
debajo del ancho de contenido del `<select>`) y `.audio-app-add` recibe `flex-wrap: wrap` con el
botón "Añadir juego" a ancho automático (baja de fila si no cabe). Los `<select>/<input>` del form
de Ajustes reciben `min-width: 0` para no forzar la columna. Retoques de coherencia: mismo `gap` y
alineación en las filas de alta. Nada de rediseño.

**2. Biblioteca — tamaño de archivo.**
Nuevo formateador puro `formatFileSize(bytes)` en `@shared/library` (B/KB/MB/GB; 1 decimal cuando
aporta). En `ClipCard`, bajo `.clip-meta`, una línea `.clip-size` con el tamaño
(`formatFileSize(clip.sizeBytes)`), en color atenuado. Aplica a vídeo y captura.

**3. Biblioteca — tooltips + basurero.**
`title` en los cinco botones de acción (favorito/renombrar/editar/abrir carpeta/eliminar), con el
mismo texto que su `aria-label`. El botón de eliminar cambia el glifo `✕` por el **SVG de basurero**
(el mismo `path` que usa `.audio-app-trash` en Grabación) y una clase que lo pinta rojo, reutilizando
el patrón existente. Se conservan `aria-label`, `disabled` y el handler.

## Archivos / módulos afectados

- `src/renderer/styles.css` — fix de `.audio-app-add`/selects; `.clip-size`; estilo rojo del
  basurero de la card (reutiliza el patrón de `.audio-app-trash`).
- `src/shared/library.ts` — `formatFileSize(bytes)`.
- `src/renderer/components/ClipCard.tsx` — línea de tamaño; `title` en los botones; SVG de basurero.
- Tests:
  - `src/shared/__tests__/library.test.ts` — `formatFileSize` (B/KB/MB/GB, 0, negativos, límites).
  - `src/renderer/__tests__/biblioteca.test.tsx` — la card muestra el tamaño; los botones tienen
    tooltip; el de eliminar es el basurero (svg) y conserva `aria-label`.
  - `src/renderer/__tests__/biblioteca-css.test.ts` — regresión: `.audio-app-add label` tiene
    `min-width: 0`.

## Decisiones y alternativas consideradas

- **`formatFileSize` nuevo en vez de reutilizar `formatStorage`.** `formatStorage` es para totales
  de almacenamiento (solo MB/GB) y devuelve "0 MB" para archivos pequeños (capturas de pocos KB).
  Un formateador por-archivo con KB es más honesto. Alternativa descartada: ampliar `formatStorage`
  y arriesgar los textos del indicador de disco que ya dependen de su formato.
- **`min-width: 0` como fix real del estirón.** Alternativa descartada: acortar el texto de las
  opciones del `<select>` — esconde info útil y no arregla la causa (el flex que no encoge).
- **Reutilizar el SVG de basurero existente.** Coherencia con Ajustes › Audio; una sola voz visual.

## Riesgos

- **Regresión visual mínima** en Ajustes por los cambios de flex; se comprueba a mano en la app.
- **`formatFileSize` y textos:** los tests fijan los umbrales para no romper con redondeos.

---

**Estado:** ⏳ pendiente de aprobación
