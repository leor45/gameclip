# Spec — Editor de clips (Fase 5)

**Tipo:** Feature
**Rama:** `feature/editor-clips`
**Fecha:** 2026-07-11

## Problema / Objetivo

Los clips se capturan enteros: sobra material antes y después del momento importante y no hay
forma de quedarse solo con lo bueno ni de compartirlo en otro formato. Objetivo: editor básico
estilo de las apps de clips — recortar un clip con vista previa y exportarlo (MP4 o GIF, con calidad a
elegir), guardándolo donde el usuario quiera o copiándolo al portapapeles para pegarlo en
Discord/donde sea.

## Alcance

**Dentro:**
- Vista Editor sobre un clip de la biblioteca (entrada: botón "Editar" en la tarjeta).
- Recorte: selección de inicio/fin sobre la duración, con vista previa del segmento en el
  reproductor.
- Exportación con ffmpeg (binario de `ffmpeg-static`, sin instalar nada a mano): MP4
  (H.264 + AAC) o GIF (paleta optimizada), presets de calidad (alta/media/baja), destino
  elegido con diálogo de guardado, progreso visible y cancelable.
- Compartir: copiar el archivo exportado al portapapeles (como archivo, no texto) y
  mostrarlo en la carpeta.
- El recorte exportado **no** toca el clip original.

**Fuera (explícito):**
- Resto de herramientas del editor de las apps de clips (texto, zoom, censura, música…): llegarán de
  forma incremental con specs propios.
- Editar metadatos desde el editor (eso vive en la Biblioteca).
- Exportaciones concurrentes (una a la vez).
- Subir/compartir a servicios externos (sin nube por ahora).

## Criterios de aceptación

- [x] Desde la Biblioteca, "Editar" abre el Editor con ese clip cargado.
- [x] Se puede ajustar inicio y fin del recorte y previsualizar exactamente ese segmento.
- [x] Exportar a MP4 y a GIF produce un archivo en la ruta elegida con el recorte pedido.
- [x] La exportación muestra progreso y puede cancelarse (sin dejar archivos a medias).
- [x] El archivo exportado se puede copiar al portapapeles como archivo y pegar en el
      Explorador, y se puede abrir su carpeta.
- [x] Los tests cubren la construcción de argumentos de ffmpeg, el manager de exportación
      (progreso, cancelación, errores) y la vista (recorte, exportación, estados).
- [x] Gates verdes (type-check · lint · tests).
