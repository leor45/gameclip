# Spec — Capturas de pantalla en la biblioteca

**Tipo:** Feature
**Rama:** `feature/capturas-en-biblioteca`
**Fecha:** 2026-07-11

## Problema / Objetivo

Las capturas de pantalla (hotkey) se guardan en disco pero **no entran al catálogo**: no se ven en
la biblioteca, no se filtran, no se pueden borrar desde la app y no cuentan en el uso de disco. Hay
que ir a la carpeta a mano. Deben verse como un ítem más de la biblioteca, filtrarse por juego /
Escritorio igual que los clips, y comportarse como lo que son: una imagen, no un video.

## Alcance

**Dentro:**

- El catálogo distingue **video** e **imagen** (`kind`), y la reconciliación indexa también los PNG
  de las carpetas `Capturas/`.
- La captura tomada con la hotkey se registra en el catálogo en el acto, con el juego detectado
  (así hereda el filtro por juego / Escritorio).
- Tarjeta de imagen: la misma que la de un clip —favorito, renombrar, etiquetas, abrir carpeta,
  eliminar— **sin botón de editor** (no hay recorte ni pistas de audio) y **sin preview en bucle**
  (es una imagen); conserva el borde al pasar el cursor.
- El clic abre el visor mostrando la imagen, no el reproductor de video.
- Miniatura generada como la de los videos (canvas en el renderer), para que la grilla no cargue
  PNG de varios MB por tarjeta.
- Uso de disco: las capturas **suman** al espacio usado (Ajustes y anillo del sidebar), pero el
  **auto-borrado nunca las elimina** — el límite existe para los videos; borrar un PNG de 2 MB no
  libera nada útil.
- El juego de un archivo escaneado se infiere de su carpeta (`Terraria/…` → Terraria;
  `Desktop/…` → sin juego).

**Fuera (explícito):**

- Editar imágenes (recortar, anotar, dibujar).
- Copiar la imagen al portapapeles desde la tarjeta.
- Otros formatos de imagen además de PNG (es lo único que la app genera).
- Exportar o compartir capturas desde el editor.

## Criterios de aceptación

Observables y verificables uno a uno:

- [x] Tomar una captura con la hotkey la hace aparecer en la biblioteca sin reiniciar la app.
- [x] La captura de un juego se filtra con ese juego; la de escritorio, con "Escritorio".
- [x] La tarjeta de una captura no ofrece el botón de editor y no reproduce nada al pasar el cursor
      (pero sí muestra el borde).
- [x] El clic sobre una captura abre la imagen en el visor.
- [x] Renombrar, etiquetar, marcar favorito, abrir carpeta y eliminar funcionan igual que en un clip
      (eliminar borra también el archivo del disco).
- [x] El espacio usado incluye las capturas, y una ronda de auto-borrado por límite nunca borra una.
- [x] Los clips existentes siguen viéndose y comportándose igual.
- [x] Gates verdes: `npm run typecheck`, `npm run lint`, `npm run test`.
