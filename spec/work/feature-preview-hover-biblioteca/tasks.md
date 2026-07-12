# Tasks — Preview al pasar el cursor sobre la tarjeta (biblioteca)

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. `Biblioteca`: estado `preview` (qué tarjeta previsualiza). Vive en la grilla para que solo
      haya UNA preview viva; apagar solo apaga la propia (un `mouseleave` tardío de otra tarjeta no
      puede matar la preview de la que el cursor ya apunta).
- [x] 2. `ClipCard`: retardo de 250 ms en `mouseenter`/`focus` (cancelado al salir y al desmontar),
      montaje del `<video>` mudo con el thumbnail de `poster`, y bucle a los 10 s en `onTimeUpdate`.
      Al salir, el `<video>` se **desmonta**: pausarlo dejaría vivos el búfer y el decodificador.
- [x] 3. `prefers-reduced-motion: reduce` → no se reproduce nada (queda el borde y el thumbnail).
- [x] 4. Estilos: borde blanco en `:hover` / `:focus-within` (solo cambia el color del borde que ya
      existe: sumar grosor correría la grilla) y el video en el mismo marco 16:9 que la imagen.

## Tests unitarios (obligatorios)

- [x] `biblioteca.test.tsx` — antes del retardo no hay video (barrer la grilla no dispara previews);
      tras el retardo se monta, mudo, con el `src` del clip y el thumbnail de `poster`; al salir el
      video **se desmonta** y vuelve el thumbnail; a los 10 s el bucle rebobina; apuntar otra tarjeta
      mata la anterior (una sola viva); con `prefers-reduced-motion` no hay preview.
- [x] `biblioteca-css.test.ts` — la preview ocupa el mismo marco absoluto que la imagen (no puede
      estirar la card: sostiene el fix de `fix/biblioteca-cards-uniformes`).

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 347
- [ ] Comprobación manual en la app: jsdom no reproduce video, así que el movimiento real (y que no
      quede ninguna preview viva al salir) se comprueba en la app.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
