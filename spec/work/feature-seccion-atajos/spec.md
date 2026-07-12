# Spec — Sección Atajos

**Tipo:** Feature
**Rama:** `feature/seccion-atajos`
**Fecha:** 2026-07-12

## Problema / Objetivo

Los atajos están **repartidos** por tres secciones de Ajustes (General: guardar clip; Grabación:
cambio de juego y captura de pantalla; Audio: push-to-talk) y se editan **escribiendo el acelerador
a mano en un `<input type="text">`**. Eso trae tres problemas:

1. **No hay validación.** Se puede escribir `asdf`: `globalShortcut.register()` falla y el `catch`
   está vacío (`src/main/index.ts:301-305`), así que el atajo simplemente **no funciona y nadie
   avisa**. Igual si la tecla ya está tomada por otra app.
2. **Las colisiones se ignoran en silencio.** Si dos acciones comparten tecla, el main descarta la
   segunda con un `console.warn` que el usuario nunca ve (`index.ts:292-300`).
3. **No hay atajo para la grabación normal** (la larga, no el clip retroactivo): solo se puede
   iniciar y parar desde la UI.

**Objetivo:** una sección **Atajos** que liste todas las acciones con su tecla actual y permita
reasignarlas **capturando la pulsación** (clic en "Editar atajo…" → pulsa la combinación), al estilo
de Discord, con detección de colisiones visible y un botón para volver a los valores por defecto.

## Alcance

**Dentro:**
- Sección nueva **Atajos** en Ajustes: una fila por acción con su nombre, una línea de descripción y
  la tecla actual, más el botón de edición. Diseño en filas, como la referencia aportada.
- **Captura de pulsación**: al pulsar "Editar atajo…" el botón queda a la escucha ("Pulsa una
  combinación…") y toma la siguiente tecla o combinación (`Alt+C`, `Ctrl+Shift+S`, `F8`…). `Esc`
  cancela. Solo se aceptan combinaciones válidas como acelerador de Electron.
- **Atajo nuevo `recordingHotkey`** (por defecto `F7`): inicia y para la grabación normal. Se
  registra solo si el modo de grabación no está apagado, igual que el de guardar clip.
- **Colisiones visibles**: si dos acciones comparten tecla, la sección lo marca y no deja guardar
  hasta resolverlo (hoy el main descartaba la segunda en silencio).
- **La tecla del push-to-talk queda reservada**: no se puede asignar a ningún atajo (aunque el PTT
  esté apagado — para que encenderlo luego no rompa nada), y la sección lo indica con una leyenda
  que dice cuál es esa tecla y dónde se cambia (Audio).
- **Restablecer atajos por defecto**: botón en la sección; solo toca los atajos, no el resto de los
  ajustes.
- Las otras secciones (General, Grabación) pasan a **mostrar** su atajo como texto informativo, no
  editable, con un enlace a la sección Atajos.
- El aviso in-game (overlay) anuncia también el atajo de grabación.

**Fuera (explícito):**
- El **push-to-talk se queda en Audio** con su selector actual: usa otro motor (escucha global de
  teclas, `uiohook`) con una lista blanca cerrada y sin combinaciones — no comparte formato con los
  aceleradores de Electron y unificarlos es otra tarea.
- **No se añade el estado "sin asignar"**: toda acción tiene siempre una tecla; para desactivarla se
  usan los interruptores que ya existen (cambio de juego, capturas, modo de grabación).
- No se detectan atajos **tomados por otras aplicaciones** (Windows no lo expone de forma fiable);
  eso seguirá fallando en silencio, como hoy.

## Criterios de aceptación

- [ ] Ajustes → Atajos lista las cuatro acciones (guardar clip · grabar · captura de pantalla ·
      cambiar de juego) con la tecla que tienen configurada ahora mismo.
- [ ] Al pulsar "Editar atajo…" y teclear `Alt`+`C`, la fila pasa a mostrar `Alt+C`; al guardar, el
      atajo queda registrado y funciona. `Esc` cancela sin cambiar nada.
- [ ] Asignar a dos acciones la misma tecla marca la colisión en la UI y bloquea el guardado.
- [ ] Intentar asignar la tecla del push-to-talk (p. ej. `F9`) a un atajo se rechaza al capturarla,
      con el motivo; la sección muestra la leyenda de que esa tecla está reservada.
- [ ] El atajo de grabación arranca la grabación normal y, pulsado de nuevo, la detiene y guarda el
      clip.
- [ ] "Restablecer atajos por defecto" devuelve las cuatro teclas a sus valores de fábrica sin tocar
      el resto de los ajustes.
- [ ] En General y Grabación el atajo se ve pero no se edita, con enlace a Atajos.
- [ ] Gates verdes: type-check · lint · tests.
