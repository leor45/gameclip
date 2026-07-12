# Spec — Preview al pasar el cursor sobre la tarjeta (biblioteca)

**Tipo:** Feature
**Rama:** `feature/preview-hover-biblioteca`
**Fecha:** 2026-07-11

## Problema / Objetivo

La biblioteca muestra un thumbnail estático por clip: hay que abrir el reproductor para saber qué
hay dentro. Como en las apps de clips, al pasar el cursor por una tarjeta esta debe **resaltarse** y
**previsualizar el clip en movimiento**, para poder barrer la grilla y encontrar la jugada sin abrir
nada.

**Restricción de fondo (la manda el owner):** la app corre mientras se juega, así que la preview no
puede costar recursos de más. Solo vive la del clip apuntado; al sacar el cursor **se destruye** (se
desmonta el `<video>`, no se pausa: pausar deja el búfer y el decodificador vivos) y se vuelve a
crear si el usuario vuelve a apuntar.

## Alcance

**Dentro:**

- Borde blanco fino en la tarjeta completa mientras el cursor está encima (y también al enfocarla
  con el teclado, que es el mismo estado de "esta es la tarjeta activa").
- Preview en movimiento sobre el thumbnail: reproduce los **primeros 10 segundos en bucle**, **sin
  sonido**, mientras el cursor siga encima. Al salir, vuelve al thumbnail y el video se descarta.
- **Una preview a la vez** (la de la tarjeta apuntada): no se reproducen todas las de la grilla.
- Arranque **diferido (~250 ms)**: barrer la grilla con el mouse no dispara una preview por cada
  tarjeta que se cruza.
- El thumbnail sigue de fondo (`poster`) hasta que hay primer fotograma: nada de parpadeo a negro.
- Clip más corto que 10 s: el bucle abarca todo el clip.
- Si el usuario pide menos animación (`prefers-reduced-motion`), no se reproduce nada: solo el borde.

**Fuera (explícito):**

- Preview con sonido, o control de volumen sobre la tarjeta.
- Scrubbing (arrastrar el cursor a lo ancho del thumbnail para saltar por el clip): otra feature.
- Precarga de previews de tarjetas no apuntadas (sería leer del disco decenas de MB por nada).
- Cambiar el reproductor a pantalla completa que ya abre el clic.

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] Al posar el cursor sobre una tarjeta, esta muestra un borde blanco fino.
- [ ] Tras ~250 ms con el cursor encima, el thumbnail es reemplazado por el video del clip
      reproduciéndose, mudo.
- [ ] La preview vuelve a empezar al llegar a los 10 s (bucle), indefinidamente.
- [ ] Al sacar el cursor, la preview se detiene, se descarta el `<video>` y vuelve el thumbnail.
- [ ] Cruzar el cursor rápido por varias tarjetas no deja previews reproduciéndose detrás.
- [ ] Un clip de menos de 10 s hace bucle sobre su duración completa.
- [ ] Con `prefers-reduced-motion: reduce` no hay preview (solo el borde).
- [ ] El clic sigue abriendo el reproductor grande, con sonido, desde el segundo 0.
- [ ] Gates verdes: `npm run typecheck`, `npm run lint`, `npm run test`.
