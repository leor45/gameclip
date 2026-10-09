# Tasks — Pulido del rediseño «Portada oscura»

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [ ] 1. Iconos: tests de regresión (Avatar, FF7 Intergrade, Hades ≠ Hades II, curada con «:») en rojo.
- [ ] 2. Iconos: `claveCompacta` + `buscarPorNombre` y su uso en `rutaDeJuego` (verde).
- [ ] 3. Iconos: memoria por nombre en disco (`nombres.json`) con escritura atómica y tope.
- [ ] 4. Ajustes: dos columnas en ancho con container query, grupos anchos, pie alineado.
- [ ] 5. Biblioteca: flecha atrás y transición de abrir/cerrar (sin animación con «reducir movimiento»).
- [ ] 6. Reproductor propio (`VideoPlayer`) con ±10 s, velocidad, PiP, pantalla completa y teclado.
- [ ] 7. Verificación en la app real (CDP / capturas) a 1920×1080 y 1280×800.

## Tests unitarios (obligatorios)

- [ ] `buscarPorNombre`: igualdad compacta, sufijo de edición único, sin secuelas, ambiguo → null.
- [ ] `IconService`: nombre del clip con `:` quitados y con edición → icono del instalado.
- [ ] `IconService`: icono recordado por nombre tras desinstalar (y no se recuerda uno no verificado).
- [ ] Biblioteca: flecha solo con clip abierto; cierra y devuelve el foco a la tarjeta.
- [ ] Reproductor: ±10 s y ±5 s, Espacio/K, M, límites (0 y duración), velocidad, controles ocultos
  en reposo; ↑ ↓ siguen cambiando de clip con el foco en el reproductor.
- [ ] Ajustes: los grupos anchos llevan su marca en las secciones con listas.

## Verificación (gates)

- [ ] Type-check verde (`npm run typecheck`)
- [ ] Lint verde (`npm run lint`)
- [ ] Tests verdes (`npm run test`)
- [ ] Comprobación manual: iconos en la Biblioteca, 8 secciones de Ajustes en ancho y estrecho,
  transición, flecha y reproductor en la app real.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
