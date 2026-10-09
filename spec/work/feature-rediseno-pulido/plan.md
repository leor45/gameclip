# Plan — Pulido del rediseño «Portada oscura»

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Tres piezas independientes, en la misma rama y en este orden:

1. **Iconos (main, fix con test de regresión primero).**
   - `elegir.ts`: `claveCompacta(nombre)` (letras y números en minúsculas) y
     `buscarPorNombre(nombre, candidatos)`: primero igualdad compacta; si no hay, el único candidato
     cuyo nombre compacto es el del clip + un sufijo de edición de una lista cerrada. Puro, sin IO.
   - `servicio.ts`: `rutaDeJuego` usa `buscarPorNombre` sobre los instalados y, si encuentra uno,
     sigue con el nombre del launcher (índice, exes, proceso en ejecución). La lista curada, los
     juegos manuales y los juegos en ejecución se comparan con `claveCompacta`.
   - Memoria por nombre en disco: `nombres.json` en la carpeta de caché (`claveCompacta` → archivo PNG
     ya cacheado). Se escribe al resolver un icono **verificado** por nombre (escritura atómica, como
     los PNG) y se lee cuando la resolución da null. Tope de entradas para que no crezca sin fin.
2. **Ajustes en ancho (solo CSS + una clase).** `settings.css` con una container query sobre el
   área del formulario: a partir de ~1400 px, la columna de grupos pasa a `grid` de dos columnas,
   centrada con máximo ~1000 px; los grupos marcados como anchos (`.settings-group.wide`, o por
   contenido: listas y mezcla) ocupan las dos. El pie fijo alinea su botón con ese mismo ancho.
   Debajo, nada cambia.
3. **Biblioteca: transición, flecha atrás y reproductor.**
   - `Biblioteca.tsx`: botón flecha antes del `h1` cuando hay clip abierto (`cerrarPanel(id, true)`);
     clases de entrada/salida para la animación. El cierre espera la animación de salida (120 ms) y
     después hace lo mismo que hoy (scroll y foco). El origen del crecimiento se mide de la tarjeta
     pulsada (`getBoundingClientRect`) y se pasa como variables CSS.
   - `components/library/VideoPlayer.tsx` (nuevo): `<video>` sin `controls` + barra propia. Estado
     derivado de los eventos del vídeo (`timeupdate`, `durationchange`, `volumechange`,
     `ratechange`, `play`/`pause`, `progress`). Barra de posición accesible (`role="slider"`, flechas
     con foco), menú de velocidad (0,25×–2×, los mismos pasos que el nativo), imagen en imagen
     (`requestPictureInPicture`, solo si el documento lo admite) y pantalla completa del contenedor.
     Teclado en el contenedor del reproductor; ↑ ↓ / Intro / Esc no se tocan (los atiende la
     Biblioteca, que deja de excluir el `<video>` porque ya no tiene controles nativos).
   - `ClipPlayer.tsx` monta `VideoPlayer` para vídeos; las capturas siguen con `<img>`.
   - `library.css`: estilos del reproductor, animaciones y `prefers-reduced-motion`.

## Archivos / módulos afectados

- `src/main/icons/elegir.ts`, `src/main/icons/servicio.ts` + tests de iconos.
- `src/renderer/styles/settings.css` (y, si hace falta, la clase de grupo ancho en `views/ajustes/*`).
- `src/renderer/views/Biblioteca.tsx`, `src/renderer/components/ClipPlayer.tsx`,
  `src/renderer/components/library/VideoPlayer.tsx` (nuevo), `src/renderer/styles/library.css` +
  tests de Biblioteca y del reproductor.
- `spec/constitution/roadmap.md` al entregar.

## Decisiones y alternativas consideradas

- **Sufijos de edición en lista cerrada** — descartada la distancia de edición: pondría el icono de
  otro juego («Hades» / «Hades II», «Dark Souls» / «Dark Souls III»).
- **Memoria por nombre solo de iconos verificados** — uno sacado de un proceso que se llama igual
  (no verificado) podría ser de otra app y quedaría fijado para siempre.
- **Reproductor propio en lugar de estilar los controles nativos** — los pseudo-elementos de
  `::-webkit-media-controls` no permiten añadir ±10 s ni cambiar el diseño de forma estable.
- **Container query en Ajustes** en lugar de media query — el ancho útil depende de la barra lateral
  y del menú de secciones, no de la ventana.
- **Animación con CSS (keyframes) y un retardo corto al cerrar** — sin librerías; la View Transitions
  API anima capturas de pantalla completas y es más difícil de cortar con «reducir movimiento».

## Riesgos

- **Liberar el `<video>`**: el reproductor nuevo sigue desmontándose con `key={clip.id}`; el borrado
  sigue desmontándolo antes (`flushSync`). La animación de cierre no puede retrasar ese desmontaje
  al borrar: al borrar no se anima.
- **Teclado**: ←/→ y Espacio con el foco en un botón del reproductor no deben disparar dos acciones.
- **Iconos**: un sufijo de edición mal elegido podría unir dos juegos distintos; la lista es cerrada y
  exige candidato único.
- **Ajustes**: secciones con grupos de alturas muy distintas pueden quedar descompensadas en dos
  columnas; se revisan las 8 en la app real.

---

**Estado:** ✅ aprobado el 2026-10-09 (el owner aprobó la maqueta: «de resto sí me gusta el cambio»,
con el sello de duración de las tarjetas sin tocar)
