# Spec — Pulido del rediseño «Portada oscura»

**Tipo:** Feature (con un fix de iconos dentro)
**Rama:** `feature/rediseno-pulido` (desde `feature/rediseno-portada-oscura`, aún sin merge a `main`)
**Fecha:** 2026-10-09

## Problema / Objetivo

El owner usó el rediseño (build 1.0.0 de prueba) un día entero y dejó cuatro observaciones:

1. En la Biblioteca faltan iconos de juegos que en Ajustes sí salen.
2. En pantallas anchas, las secciones de Ajustes con pocas opciones dejan más de media pantalla vacía
   y «Guardar ajustes» queda lejos del formulario.
3. Al abrir un clip el cambio de vista es brusco; falta una flecha para volver junto a «Biblioteca».
4. El reproductor usa los controles nativos de Chromium: sin botones para adelantar o retroceder y
   fuera del lenguaje visual de la app.

Maqueta aprobada (2026-10-09): https://claude.ai/artifact/VWnoLwJAijuNBzGmQQhR9d — Ajustes en la
variante B (filas «grupo | controles»; el owner la eligió frente a la A). El sello amarillo con la duración o «Captura» de las tarjetas
**no cambia** (lo pidió el owner).

## Causa raíz de los iconos (fix)

Ajustes pide el icono por el **ejecutable** (`icons.forExe`); la Biblioteca por el **nombre guardado
en el clip** (`icons.forGame`). `IconService.rutaDeJuego` compara ese nombre con el de los launchers
con igualdad exacta (`claveNombre`: recorte + minúsculas). Medido en la biblioteca real del owner:

- `Avatar  Frontiers of Pandora` (clip; los `:` se quitan al nombrar la carpeta) ≠
  `Avatar: Frontiers of Pandora` (Steam). Igual `Honkai  Star Rail` frente a la lista curada.
- `FINAL FANTASY VII REMAKE` (49 clips) ≠ `FINAL FANTASY VII REMAKE INTERGRADE` (Steam).
- Juegos desinstalados: ya no hay `.exe` del que sacar el icono.

## Alcance

**Dentro:**

- **Iconos:**
  - nombres equivalentes si coinciden sus letras y números (sin signos ni espacios);
  - si no hay coincidencia, un único juego instalado cuyo nombre sea el del clip más un sufijo de
    edición conocido (Intergrade, Remastered, Game of the Year Edition, Definitive Edition,
    Complete Edition, Deluxe Edition…); nunca números ni secuelas («Hades» ≠ «Hades II»);
  - el icono resuelto por nombre se recuerda en disco (`userData/icons/nombres.json`): un juego que se
    desinstala después conserva su icono.
- **Ajustes en ancho (variante B):** desde ~1180 px de ancho de formulario, cada grupo es una fila:
  su etiqueta a la izquierda y sus controles a la derecha, en una columna centrada (máx. ~1040 px), y el
  botón «Guardar ajustes» se alinea con su borde derecho. Por debajo, una columna como hoy.
- **Abrir y cerrar un clip:** transición rápida (≈180 ms al abrir, ≈120 ms al cerrar; el reproductor
  crece desde la tarjeta, el índice entra desde la derecha). Sin animación con «reducir movimiento».
- **Flecha atrás** junto a «Biblioteca», solo con un clip abierto; hace lo mismo que la X y que Esc.
- **Reproductor propio** en el panel (sustituye a `controls` nativos) con todo lo que hoy ofrece el
  nativo: reproducir/pausa, barra de posición (con la hora al pasar el ratón y arrastre), tiempo
  actual/total, volumen y silencio, velocidad de reproducción, imagen en imagen y pantalla completa.
  Además, **retroceder y adelantar 10 s** (pedido por el owner). Los controles se ocultan tras 2 s de
  reproducción sin mover el ratón. Las capturas (imágenes) no llevan controles.
- **Teclado** con el foco en el reproductor: Espacio/K reproducir, ← → ±5 s, J L ±10 s, M silencio,
  F pantalla completa. ↑ ↓, Intro y Esc siguen como hoy (cambiar de clip, editor, cerrar).

**Fuera (explícito):**

- Cambios en las tarjetas de la cuadrícula (el sello de duración se queda como está).
- Botón atrás del ratón para cerrar el clip.
- «Descargar» del menú ⋮ nativo: el archivo ya está en disco («Abrir carpeta»).
- Iconos de juegos que ya estaban desinstalados antes de este cambio (siguen con el logo).
- Emparejar nombres por parecido general (distancia de edición).

## Criterios de aceptación

- [ ] `Avatar  Frontiers of Pandora` y `FINAL FANTASY VII REMAKE` muestran el icono del juego
  instalado; `Hades` no toma el icono de `Hades II`.
- [ ] Un juego cuyo icono se resolvió una vez lo conserva tras desinstalarlo (reinicio incluido).
- [ ] Ajustes a 1920×1080: grupos en filas «etiqueta | controles» centradas, botón de guardar
  alineado con el formulario; a 1280 px, una columna como hoy; el pie sigue fijo.
- [ ] Abrir un clip anima en ≤ 200 ms; cerrar en ≤ 150 ms; con «reducir movimiento», sin animación.
- [ ] La flecha atrás aparece solo con un clip abierto y vuelve a la cuadrícula en la misma posición y
  con el foco en la tarjeta.
- [ ] El reproductor ofrece todo lo del nativo (salvo «Descargar») más ±10 s, con teclado y foco
  visible; el `<video>` se libera al cambiar de clip o cerrar (borrar sigue funcionando).
- [ ] Gates verdes: type-check, lint y tests.
