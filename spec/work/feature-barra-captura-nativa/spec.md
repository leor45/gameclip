# Spec — Barra de captura: indicador de juego y duración del clip

**Tipo:** Feature
**Rama:** `feature/barra-captura-nativa`
**Fecha:** 2026-07-11

## Problema / Objetivo

La barra superior es funcional pero "de andamio": una fila de texto plano con botones. Debe verse
como parte del diseño de la app (según el adjunto del owner) y ganar dos cosas que hoy
obligan a entrar a Ajustes o a adivinar:

- **Qué juego se está capturando**, y si la app lo reconoció por su lista o si es un juego que el
  usuario añadió a mano.
- **Cuánto dura el clip retroactivo** (el buffer), configurable desde ahí mismo.

Referencia visual del owner: una píldora `🎮 Waiting For Game` a la izquierda y un control
`Clip 1m` a la derecha.

## Alcance

**Dentro:**

- Píldora de estado del juego, con icono: nombre del juego activo, o "Esperando juego" cuando no
  hay ninguno. Marca visible cuando el juego es **manual** (añadido por el usuario) frente a
  detectado por la lista curada.
- Control de **duración del clip** en la barra: cambia `replaySeconds` y se guarda al instante
  (opciones tipo 30 s · 1 m · 2 m · 3 m · 5 m).
- Rediseño visual de la barra acorde a la app: píldoras, estado de grabación con punto rojo, y los
  botones existentes (Guardar clip · Grabar · Detener) con el mismo lenguaje visual.
- El estado sigue viniendo del main (`capture:status-changed`) y la duración se refleja al vuelo con
  `settings:changed` (por ejemplo, si se cambia desde Ajustes).

**Fuera (explícito):**

- Cambiar el juego activo desde la barra (ya existe la hotkey F10; sería otra feature).
- Añadir o quitar juegos manuales desde la barra (se hace en Ajustes → Grabación).
- Mostrar la lista de juegos en ejecución.
- Rehacer el resto del shell de la app (sidebar, vistas).

## Criterios de aceptación

Observables y verificables uno a uno:

- [x] Sin juego: la barra muestra "Esperando juego".
- [x] Con un juego detectado por la lista curada: muestra su nombre.
- [x] Con un juego añadido manualmente por el usuario: muestra su nombre y una marca de "manual".
- [x] El selector de duración muestra el valor actual (p. ej. `1 m`) y al cambiarlo guarda
      `replaySeconds` sin pasar por Ajustes.
- [x] Cambiar la duración desde Ajustes actualiza el control de la barra en el acto.
- [x] Grabando, la barra lo indica (punto rojo) y ofrece Detener; en buffer ofrece Guardar clip y
      Grabar.
- [x] Gates verdes: `npm run typecheck`, `npm run lint`, `npm run test`.
