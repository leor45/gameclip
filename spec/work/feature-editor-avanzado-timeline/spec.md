# Spec — Editor avanzado: timeline por trozos (tipo DaVinci)

**Tipo:** Feature
**Rama:** `feature/editor-avanzado-timeline` (desde `feature/rediseno-pulido`)
**Fecha:** 2026-10-09

## Problema / Objetivo

El owner probó el editor avanzado y:

1. **No sigue la maqueta aprobada** del rediseño (https://claude.ai/artifact/Ey5h8DZ9S7xBtWC7MLKXGh):
   los nombres de pista van superpuestos a las propias pistas, la barra de cortes es una franja gris
   plana y los controles usan glifos sueltos.
2. **Los cortes no se ven.** Dividir (S) y borrar (Supr) ya existen, pero los trozos salen pegados y
   la tira de fotogramas se estira sin reflejar los cortes; recortar el inicio/fin no da pista visual.
3. Quiere editar **como en DaVinci Resolve** (sin transiciones): cortar, que cada trozo quede como un
   bloque separado, recortarle el principio o el final por su borde y quitarlo.
4. Echa en falta ver **el volumen de cada pista** (existe, pero el deslizador apenas se ve).

Maqueta aprobada (2026-10-09): https://claude.ai/artifact/4wraWefCYqivnXti8XFYok

## Alcance

**Dentro:**

- **Timeline por trozos:** cada segmento conservado se dibuja como un bloque propio en todas las
  pistas a la vez (vídeo y audio), separado del siguiente por un hueco visible. El seleccionado se
  marca en amarillo en todas las pistas. Clic en un bloque lo selecciona y mueve el cabezal ahí.
- **Fotogramas y ondas por tramo:** cada bloque muestra los fotogramas y la onda de su propio tramo de
  origen (la tira se muestrea una vez sobre todo el clip y cada bloque enseña su parte).
- **Recortar por los bordes (nuevo):** arrastrar el borde izquierdo o derecho de cualquier trozo le
  quita o le devuelve tiempo, sin cruzar el trozo vecino (en tiempo de origen) ni bajar del mínimo
  (0,5 s). Con el foco en el asa, ← → la mueven 0,1 s (Mayús: 1 s). Un arrastre = un paso de
  deshacer. Sustituye a las asas globales de inicio/fin (que eran el caso del primer y último trozo).
- **Cabeceras en su columna** (maqueta): vídeo con el icono del juego; cada pista de audio con su
  icono (juego, PC, micrófono o el de la app), nombre, deslizador de volumen 0–200 % siempre visible,
  porcentaje (amarillo por encima de 100 %) y quitar/restaurar. La rueda sobre la pista sigue
  cambiando el volumen. La onda crece o encoge con el volumen, como hoy.
- **Barra de herramientas** con iconos dibujados (sin emojis ni glifos sueltos): reproducir/pausa,
  detener, tiempo, Dividir (S), Borrar (Supr), deshacer, rehacer, Restablecer, duración, zoom.
- **Al borrar un trozo,** los demás se juntan con una transición corta (sin ella con «reducir
  movimiento»).

**Fuera (explícito):**

- Transiciones, fundidos, mover trozos de orden, varias capas de vídeo o pistas independientes por
  trozo (el audio va siempre ligado al vídeo de su trozo).
- Cambios en el render, los borradores, el reencuadre o el diálogo de render (los segmentos ya
  admiten cualquier inicio y fin).

## Criterios de aceptación

- [ ] Tras dividir, la timeline muestra dos bloques separados en vídeo y en cada pista de audio; el
  seleccionado se marca en todas.
- [ ] Cada bloque de vídeo muestra fotogramas de su tramo; cada bloque de audio, la onda de su tramo.
- [ ] Arrastrar el borde de un trozo intermedio cambia solo ese trozo, nunca cruza al vecino ni baja
  de 0,5 s; deshacer lo revierte en un paso; el render usa los segmentos resultantes.
- [ ] El volumen de cada pista se ve y se cambia desde su cabecera y con la rueda.
- [ ] Lo que ya hacía el editor sigue igual (dividir, borrar, deshacer, rehacer, restablecer, zoom,
  reencuadre, capturar fotograma, quitar/restaurar pista, render, borradores).
- [ ] Gates verdes: type-check, lint y tests.
