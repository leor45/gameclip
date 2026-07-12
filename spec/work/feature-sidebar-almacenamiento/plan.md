# Plan — Indicador de almacenamiento en el sidebar

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Todo lo que hace falta ya existe en el main: `library:get-storage-stats` da los bytes de clips y
grabaciones, y `capture:get-settings` trae `storageLimitGb`. No hay canal nuevo ni cálculo nuevo:
es un componente de presentación.

`StorageIndicator` (renderer): un anillo SVG (dos `<circle>`, el de progreso con
`stroke-dasharray`/`stroke-dashoffset`) con el usado y el límite debajo, dentro del sidebar y
envuelto en un `NavLink` a `/ajustes/almacenamiento`.

Estado y refresco:

- Al montar, pide stats + settings.
- Se resuscribe a `library.onChanged()` — el mismo evento que ya refresca la biblioteca — y vuelve
  a pedir ambas cosas. Es lo que se mueve al guardar, borrar o auto-borrar un clip. Cubre también
  el cambio de límite en Ajustes, porque guardar ajustes no toca el catálogo: para eso se refresca
  además al volver a montar (navegar a otra vista y volver) y, sobre todo, cuando la ronda de
  auto-borrado emite `changed`. **Nota:** si el usuario cambia el límite y se queda en Ajustes, la
  cifra del anillo se actualiza al siguiente cambio del catálogo; para que sea inmediato haría
  falta un evento de settings, que hoy no existe y queda fuera de alcance.

Formato de las cifras: helper puro `formatStorage(bytes)` → `3 GB` / `750 MB`, sin decimales
innecesarios (ya hay un `formatearGb` local en Ajustes → Almacenamiento; se extrae a
`@shared/library` para que lo usen los dos y quede con test).

Estados del anillo: normal (< 100 %), alerta (≥ 100 %, clase `is-full` en rojo) y sin límite
(`storageLimitGb = 0` → sin progreso, solo el usado).

## Archivos / módulos afectados

- `src/shared/library.ts` — `formatStorage(bytes)` puro (+ test), reutilizado por Ajustes.
- `src/renderer/components/StorageIndicator.tsx` *(nuevo)* — anillo + cifras + link.
- `src/renderer/components/Sidebar.tsx` — lo monta entre la navegación y el bloque de usuario.
- `src/renderer/styles.css` — estilos del anillo (tamaño compacto, estado de alerta).
- `src/renderer/views/ajustes/Almacenamiento.tsx` — usa el `formatStorage` compartido.
- Tests: `src/renderer/__tests__/sidebar.test.tsx` *(nuevo)* — cifras, porcentaje, sin límite,
  pasado de límite, refresco con `library:changed`, y el link a Ajustes.

## Decisiones y alternativas consideradas

- **Anillo SVG a mano** en vez de una librería de gráficos: son dos círculos y un `dashoffset`;
  una dependencia nueva para esto no se paga.
- **Refrescar con `library:changed`** en vez de un `setInterval`: el catálogo ya emite en cada
  alta, baja y auto-borrado, que es exactamente lo que cambia el número. Un timer sería ruido.
- **Usar los bytes del catálogo** (los que ya usa el auto-borrado) y no un `du` de la carpeta: el
  indicador tiene que mostrar la misma cifra contra la que se compara el límite, o miente.

## Riesgos

- **Desfase al cambiar el límite sin tocar el catálogo** (anotado arriba): visible solo si el
  usuario se queda mirando el sidebar dentro de Ajustes. Si molesta, se resuelve con un evento
  `settings:changed` en su propio spec.

---

**Estado:** ✅ aprobado el 2026-07-11
