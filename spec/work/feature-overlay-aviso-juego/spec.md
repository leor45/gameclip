# Spec — Aviso del overlay al detectar el juego

**Tipo:** Feature
**Rama:** `feature/overlay-aviso-juego`
**Fecha:** 2026-07-11

## Problema / Objetivo

Cuando la app detecta un juego y activa el buffer, **el usuario no se entera**: el overlay solo
muestra el punto REC al grabar y un toast al guardar. Hay que alt-tabear a la app para saber si los
clips están activos.

Objetivo (estilo de las apps de clips, adjunto del owner): al detectarse el juego, un aviso **entra deslizándose
desde arriba** en el overlay, dice que los clips están listos y recuerda las hotkeys, y a los pocos
segundos **se va deslizándose hacia arriba**.

Contenido pedido, en español y con las hotkeys **realmente configuradas**:

```
🎮  Listo para clipear
F8   Guardar el último minuto
F6   Guardar una captura
```

## Alcance

**Dentro:**

- Aviso en el overlay al pasar de "sin juego" a "juego detectado" (tanto por la lista curada como
  por un juego añadido a mano).
- Contenido: título de estado + una fila por hotkey activa, con la tecla configurada y qué hace. La
  fila del clip retroactivo dice la duración real del buffer ("el último minuto" / "los últimos 30
  segundos", según `replaySeconds`).
- Animación: entra con un deslizamiento hacia abajo y sale con uno hacia arriba, y desaparece solo
  tras unos segundos.
- Respeta el ajuste de overlay: si el overlay está desactivado, no aparece nada.
- Coherencia con el modo de grabación: si el modo es "apagado" no hay clips que anunciar (no se
  muestra); si una hotkey está desactivada, su fila no aparece.

**Fuera (explícito):**

- Que el aviso se pueda cerrar con el mouse (el overlay es click-through por diseño).
- Mostrarlo al cerrar el juego o al cambiar de juego (solo al pasar de "sin juego" a "con juego").
- Fullscreen exclusivo: el overlay sigue sin verse ahí (limitación conocida desde la Fase 6).
- Configurar la duración o el contenido del aviso.

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] Al detectarse un juego, el overlay muestra el aviso con "Listo para clipear" y las hotkeys.
- [ ] Las teclas mostradas son las configuradas (si el replay es F9, dice F9).
- [ ] La fila del clip refleja la duración del buffer configurada.
- [ ] El aviso entra deslizándose desde arriba y, a los pocos segundos, se va hacia arriba.
- [ ] Con el overlay desactivado en Ajustes no aparece.
- [ ] Con el modo de grabación en "apagado" no aparece.
- [ ] Una hotkey desactivada (p. ej. capturas) no aparece como fila.
- [ ] Gates verdes: `npm run typecheck`, `npm run lint`, `npm run test`.
