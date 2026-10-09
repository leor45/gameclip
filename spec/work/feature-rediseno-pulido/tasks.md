# Tasks — Pulido del rediseño «Portada oscura»

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. Iconos: tests de regresión (Avatar, FF7 Intergrade, Hades ≠ Hades II, curada con «:») en rojo.
- [x] 2. Iconos: `claveCompacta` + `buscarPorNombre` y su uso en `rutaDeJuego` (verde).
- [x] 3. Iconos: memoria por nombre en disco (`nombres.json`) con escritura atómica y tope.
- [x] 4. Ajustes: filas «grupo | controles» en ancho (variante B) con container query, pie alineado.
- [x] 5. Biblioteca: flecha atrás y transición de abrir/cerrar (sin animación con «reducir movimiento»).
- [x] 6. Reproductor propio (`VideoPlayer`) con ±10 s, velocidad, PiP, pantalla completa y teclado.
- [x] 7. Verificación en la app real (CDP / capturas) a 1920×1080 y 1280×800.
- [x] 9. Desplegables propios (`<Select>`) en los 17 campos de Ajustes, con iconos y buscador.
- [x] 8. Editor básico: hoja de exportación + recorte sobre fotogramas + reproductor propio (ampliación
  aprobada por el owner sobre la maqueta).

## Tests unitarios (obligatorios)

- [x] `buscarPorNombre`: igualdad compacta, sufijo de edición único, sin secuelas, ambiguo → null.
- [x] `IconService`: nombre del clip con `:` quitados y con edición → icono del instalado.
- [x] `IconService`: icono recordado por nombre tras desinstalar (y no se recuerda uno no verificado).
- [x] Biblioteca: flecha solo con clip abierto; cierra y devuelve el foco a la tarjeta.
- [x] Reproductor: ±10 s y ±5 s, Espacio/K, M, límites (0 y duración), velocidad, controles ocultos
  en reposo; ↑ ↓ siguen cambiando de clip con el foco en el reproductor.
- [x] Ajustes: las filas viven solo dentro de la container query (por debajo, nada cambia).
- [x] Editor básico: la hoja resume recorte y formato; formato y calidad como radios; reproductor
  propio sin autoplay; exportar, guardar edit, progreso y resultado intactos.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`)
- [x] Comprobación manual: iconos en la Biblioteca, 8 secciones de Ajustes en ancho y estrecho,
  transición, flecha y reproductor en la app real.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
