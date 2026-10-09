# Spec — Un rebuild encolado al empezar a grabar destruye la grabación

**Tipo:** Fix
**Rama:** `fix/rebuild-durante-grabacion`
**Fecha:** 2026-10-09

## Problema / Objetivo

Auditoría bug-hunter C, C1-BUG-2 (Medium). Si un ajuste de captura cambia (p. ej. la duración del
replay desde la barra superior) o cambia el monitor justo cuando empieza una grabación, la grabación
se pierde: el pipeline se reconstruye con ella dentro, no hay `clip-saved` y el estado acaba en
'buffering'. Con un cambio de modo de buffer, el estado se pisaba a 'buffering'/'idle' con la grabación
corriendo y ya no se podía parar ni con el atajo ni desde la UI. El caso más realista es el modo
automático: un juego que cambia la resolución mientras arranca su sesión.

**Causa raíz:** `setSettings` y `displaysChanged` miraban `status.state === 'recording'` **antes de
encolar**. `doStartRecording` deja el estado en 'buffering' mientras espera a libobs (parar el buffer,
arrancar la salida), así que en esa ventana el rebuild se encolaba; al correr, detrás de la grabación,
`rebuildPipeline` no comprobaba nada y `buildPipeline` destruía las salidas. El comentario de
`startRecording` prometía justo lo contrario («el rebuild ve el estado 'recording' y se aplaza»); solo
`applyActiveGame` lo cumplía.

## Alcance

**Dentro:**
- `queueRebuild` decide dentro de la tarea: grabando → `pendingRebuild`; si no, rebuild.
- La reconciliación del buffer por `BUFFER_SETTING_KEYS` también comprueba la grabación dentro de la
  tarea.
- `setSettings` y `displaysChanged` dejan de decidir antes de encolar.
- Tests de regresión (ajuste de pipeline, modo de buffer y cambio de monitor durante el arranque).

**Fuera (explícito):**
- Cambiar el orden o la serialización de la cola.

## Criterios de aceptación

- [ ] Un cambio de pipeline, de modo de buffer o de monitor que llega con la grabación arrancando no
      reconstruye ni pisa el estado; la grabación sigue y el cambio se aplica al parar.
- [ ] Suite verde.
