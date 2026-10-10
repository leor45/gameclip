# Spec — Rediseño «Portada oscura»

**Tipo:** Feature
**Rama:** `feature/rediseno-portada-oscura`
**Fecha:** 2026-10-09

## Problema / Objetivo

La interfaz creció pantalla a pantalla y hoy no tiene un lenguaje visual común: cada vista resuelve
a su manera tarjetas, botones, formularios y avisos, y algunas confirmaciones son alertas nativas de
Windows. El objetivo es aplicar a toda la app el diseño «Portada oscura» aprobado por el owner, **sin
cambiar la funcionalidad**: mismas opciones, mismos datos, mismos flujos, salvo las excepciones que el
owner aprobó de forma explícita (lista abajo).

Referencia visual (maqueta aprobada el 2026-10-09):
https://claude.ai/artifact/Ey5h8DZ9S7xBtWC7MLKXGh

## Principio rector

**Solo diseño.** Todo lo que la app hace hoy se sigue pudiendo hacer, con el mismo resultado. Mover
un elemento de sitio o cambiar cómo se ve es diseño; añadir datos, acciones o atajos es funcionalidad
y solo entra si está en la lista de excepciones aprobadas.

## Sistema visual

- **Color:** tinta casi negra, página, filete de 1 px, papel (texto), gris tenue, un único acento (el
  amarillo de la marca, «sello») y rojo reservado para grabar, borrar y errores.
- **Tipografía (empaquetada en la app, sin red):** Anton para titulares (juego activo, título de
  sección, clip abierto), Barlow para la interfaz, Geist Mono para cifras, teclas y ejecutables.
- **Gestos:** la duración del clip como sello amarillo inclinado; filetes en lugar de tarjetas con
  sombra; el icono del juego junto a su nombre en toda la app.

## Alcance

**Dentro — rediseño de cada pantalla con su funcionalidad actual:**

- **Barra lateral:** navegación, «Comprobar actualizaciones» (reposo, comprobando, al día, versión
  nueva), almacenamiento, sesión y versión.
- **Barra superior (variante A):** icono y nombre del juego (o «Esperando juego») con su etiqueta
  «manual», punto de estado (el texto solo se escribe si el estado no es «Buffer activo»), último clip
  sin etiqueta con icono, botón dividido «Guardar clip | duración ▾» con las duraciones de hoy
  (30 s, 1 m, 2 m, 3 m, 5 m y el valor de Ajustes si no es de la lista) y Grabar/Detener como iconos.
- **Biblioteca:** cuadrícula, búsqueda, favoritos, filtro de juego, vista previa al pasar el cursor,
  acciones de cada tarjeta (favorito, renombrar y etiquetar, editar, abrir carpeta, eliminar),
  reproductor de vídeo e imagen.
- **Editor:** «Ediciones sin terminar», editor básico (recorte, pistas, exportar, guardar edit),
  editor avanzado a pantalla completa (encuadre, captura de fotograma, timeline, pistas, render) y el
  diálogo de render.
- **Ajustes:** las 8 secciones (Grabación, General, Calidad, Audio, Atajos, Almacenamiento, Avanzado,
  Desarrollo) con todos sus campos actuales, incluidos «Juegos añadidos a mano» y «No son juegos».
- **Login, registro y el modal de versión nueva** con el mismo sistema visual.

**Dentro — excepciones aprobadas por el owner (cambian o añaden comportamiento):**

1. **Reproductor en panel:** al abrir un clip, el panel izquierdo de la Biblioteca pasa a ser el
   reproductor (sustituye a la ventana modal), con «×» y Esc para cerrar, y el resto de clips en filas
   a la derecha; ↑ ↓ cambian el clip y Intro abre el editor.
2. **Grupos por fecha** en la Biblioteca (Hoy, Ayer, Esta semana, meses), mismo orden de hoy.
3. **Filtro de juego propio:** desplegable con icono por juego, número de clips de cada uno, orden por
   cantidad, buscador interno y el contador «N clips» / «N de M» junto a la barra.
4. **Iconos oficiales** de juegos y apps sacados del propio ejecutable (las apps de Microsoft Store,
   del logo de su paquete), con el logo de GameClip como reserva cuando no hay icono. «Audio del
   juego» y «Micrófono» llevan iconos fijos (mando y micrófono); Escritorio, un monitor.
5. **Pie fijo en Ajustes:** el formulario hace scroll propio y la barra «Guardar ajustes» queda fija
   abajo.
6. **Enlace del selector de duración:** el pie del menú «Ajustes → General ›» abre Ajustes → General
   con el foco en «Duración del buffer (segundos)», marcado en amarillo un momento.
7. **Modales propios en lugar de diálogos nativos:** confirmar eliminación de clip/grabación/captura,
   el error si no se pudo eliminar, y la pregunta de reiniciar al cambiar la compatibilidad HDR de
   las capturas.

**Fuera (explícito):**

- Cualquier funcionalidad nueva no listada arriba (p. ej. exportar desde la Biblioteca, «Descartar»
  en Ajustes, contador de cambios sin guardar, preset «Personalizado»).
- Los overlays in-game (aviso, toast, indicador REC, overlay de rendimiento): son ventanas aparte y
  no cambian.
- El `showErrorBox` de la API al arrancar: salta antes de que exista la ventana y sigue nativo.
- Tema claro: la app sigue siendo solo oscura.
- Cambios en el servidor, la captura, la biblioteca en disco o el formato de los ajustes.

## Criterios de aceptación

- [ ] Las tres fuentes se cargan desde la propia app (sin red) y se ven en barra superior, títulos,
      cifras y teclas.
- [ ] Barra lateral: el botón de actualizaciones muestra sus 4 estados y el aviso de versión nueva
      abre el release, como hoy.
- [ ] Barra superior: con buffer activo se ve solo el punto amarillo (texto en el tooltip);
      «Grabando», «Iniciando captura…», «Captura lista» y «Captura no disponible» se escriben.
- [ ] Barra superior: el menú de duración lista 30 s, 1 m, 2 m, 3 m, 5 m (más el valor de Ajustes si
      no es de la lista), marca el actual, aplica al elegir y se cierra con Esc o clic fuera.
- [ ] El pie «Ajustes → General ›» lleva a General con el foco en la duración del buffer.
- [ ] Guardar clip, Grabar y Detener se muestran y funcionan en los mismos estados que hoy.
- [ ] El icono de un juego se muestra en barra superior, filtro, tarjetas, filas, editor y listas de
      Ajustes; sin icono se ve el logo de GameClip al mismo tamaño; el icono no bloquea la UI.
- [ ] Biblioteca: grupos por fecha en el orden de hoy; vista previa al pasar el cursor como hoy; las 5
      acciones de la tarjeta disponibles con ratón y teclado.
- [ ] Biblioteca: abrir un clip lo muestra en el panel; «×» y Esc lo cierran; ↑ ↓ cambian de clip;
      Intro abre el editor; las capturas se ven como imagen.
- [ ] Filtro de juego: Todos, Escritorio y los juegos con sus contadores y orden por cantidad; el
      buscador filtra la lista; si el juego filtrado se queda sin clips, el filtro se suelta como hoy.
- [ ] Eliminar abre un modal propio con miniatura y título; Cancelar tiene el foco; Esc cancela; un
      fallo muestra el modal de error con el mensaje de hoy.
- [ ] Cambiar la compatibilidad HDR de capturas pregunta con un modal propio («Reiniciar ahora» /
      «Al próximo arranque») con el mismo efecto que el diálogo nativo de hoy.
- [ ] Ajustes: las 8 secciones con todos sus campos; el formulario hace scroll y «Guardar ajustes»
      queda visible abajo; los bloqueos y «Ajustes guardados ✓» funcionan como hoy.
- [ ] Editor básico, avanzado y diálogo de render conservan todas sus acciones y atajos.
- [ ] Type-check, lint y tests verdes; comprobación visual en la app real de cada pantalla.
