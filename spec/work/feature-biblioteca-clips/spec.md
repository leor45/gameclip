# Spec — Biblioteca de clips (Fase 4)

**Tipo:** Feature
**Rama:** `feature/biblioteca-clips`
**Fecha:** 2026-07-11

## Problema / Objetivo

Los clips (replay F8 y grabaciones manuales) quedan sueltos en la carpeta de salida: no hay
registro, ni vista para encontrarlos, reproducirlos ni gestionarlos. Objetivo: una biblioteca
local estilo de las apps de clips — todo clip guardado queda catalogado con metadatos y se puede ver,
buscar, filtrar y gestionar desde la app.

## Alcance

**Dentro:**
- Catálogo local en SQLite (proceso main, detrás de una capa de repositorio): título, ruta,
  juego detectado (best-effort: ventana en primer plano al guardar), fecha, duración, tamaño,
  etiquetas, favorito, thumbnail.
- Ingesta automática: cada clip guardado (replay o grabación) se registra al momento; al
  arrancar, la carpeta de salida se reconcilia con el catálogo (altas de archivos nuevos,
  bajas de archivos borrados a mano).
- Vista Biblioteca: grilla con thumbnails, reproducción en la app, búsqueda por texto
  (título/juego/etiquetas) y filtros (favoritos, juego).
- Gestión por clip: renombrar, etiquetar, favorito, eliminar (con confirmación, borra
  archivo y registro) y abrir carpeta en el Explorador.
- Thumbnails y duración generados en el renderer (frame de `<video>` a canvas), sin ffmpeg.

**Fuera (explícito):**
- Edición/recorte de clips (Fase 5).
- Detección automática de juegos en ejecución y auto-inicio del buffer (Fase 6); aquí solo
  se anota el nombre de la ventana activa al guardar.
- Sincronización con el server / nube (el catálogo es 100 % local).
- Importar carpetas arbitrarias (solo la carpeta de salida configurada).

## Criterios de aceptación

- [x] Guardar un clip (replay o grabación) lo hace aparecer en la Biblioteca sin reiniciar.
- [x] Los clips ya existentes en la carpeta de salida aparecen tras arrancar la app.
- [x] Borrar el archivo a mano y arrancar la app lo quita del catálogo.
- [x] La grilla muestra thumbnail, título, duración, fecha y juego; clic reproduce el clip
      dentro de la app.
- [x] Buscar por texto filtra por título, juego y etiquetas; hay filtro de favoritos y por juego.
- [x] Renombrar, etiquetar, marcar favorito, eliminar (con confirmación) y abrir carpeta
      funcionan desde la vista.
- [x] Los tests cubren el repositorio (CRUD, búsqueda, filtros, reconciliación) y la vista
      (grilla, búsqueda, acciones) — suite verde.
- [x] Gates verdes (type-check · lint · tests).
