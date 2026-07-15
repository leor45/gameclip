# Tasks — Contador de juegos y detalle de detección en Desarrollo

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. `Grabacion.tsx` — hint cuenta juegos distintos (`new Set(Object.values(index)).size`).
- [x] 2. `Desarrollo.tsx` — carga el índice y añade el `<details>` colapsado con recuento + tabla
       `ejecutable → juego`.
- [x] 3. `styles.css` — estilos del desplegable/tabla (scroll, cabecera sticky) con las variables ya
       existentes.

## Tests unitarios (obligatorios)

- [x] `grabacion.test.tsx` — el hint muestra "1 juegos reconocidos" (índice con un juego).
- [x] `ajustes.test.tsx` — el desplegable de Desarrollo arranca colapsado y lista el mapa
      `ejecutable → juego` con el recuento correcto (2 juegos · 3 ejecutables).

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 743 pasan
- [ ] Comprobación visual (owner): en Ajustes → Grabación se lee "N juegos reconocidos"; en Ajustes →
      Desarrollo el desplegable aparece colapsado y, al abrirlo, muestra la tabla.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
