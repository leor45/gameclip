# Plan — Contador de juegos y detalle de detección en Desarrollo

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Solo presentación; el índice (`GameIndex` = `ejecutable → nombre`) ya llega al renderer por
`window.gameclip.games.getIndex()`.

- **Juegos distintos** = `new Set(Object.values(index)).size`. **Ejecutables** = `Object.keys(index).length`.
  Se calculan en el renderer, sin tocar main.
- **Grabación**: el hint pasa de "M ejecutables reconocidos" a "N juegos reconocidos".
- **Desarrollo**: `Desarrollo.tsx` pasa a cargar el índice (mismo patrón `useEffect` + `getIndex()` que
  `Grabacion.tsx`) y pinta un `<details>` (sin `open` → colapsado) con `<summary>` = recuento y, dentro,
  una tabla `ejecutable → juego` ordenada por nombre. Solo lectura.

## Archivos / módulos afectados

- `src/renderer/views/ajustes/Grabacion.tsx` — el `<p className="settings-hint">` de "Detección de
  juegos" cuenta juegos en vez de ejecutables.
- `src/renderer/views/ajustes/Desarrollo.tsx` — cargar el índice y añadir el bloque `<details>`
  colapsado con el recuento + tabla.
- `src/renderer/styles.css` — estilos mínimos para la tabla/desplegable si hacen falta (reusar lo que
  haya; nada nuevo si el `<details>` por defecto ya se ve bien).
- `src/renderer/__tests__/grabacion.test.tsx` — actualizar la aserción del texto (ahora "1 juegos
  reconocidos" con el índice `{ pioneergame: 'ARC Raiders' }`).
- `src/renderer/__tests__/ajustes.test.tsx` — test nuevo del desplegable de Desarrollo: colapsado por
  defecto, muestra el recuento y la fila `ejecutable → juego`. Fijar un `getIndex` de ejemplo en el mock.

## Decisiones y alternativas consideradas

- **Contar juegos** (`Set` de valores) vs **exponer el recuento real de `InstalledGame` por IPC** — se
  cuenta desde el índice en el renderer: no hace falta IPC nuevo, y "juegos con al menos un ejecutable
  detectable" es justo lo que importa para la detección. (Puede diferir en ±1 del "N juegos" del log si
  algún juego no aportó ningún exe; para el usuario es el número honesto de lo detectable.)
- **`<details>` nativo** vs un acordeón propio — nativo: colapsado por defecto sin JS, accesible, y ya
  hay precedente de HTML simple en Ajustes. Cero dependencia.
- **Solo lectura** vs editor del índice — solo lectura: es diagnóstico; editar el índice es otra cosa
  (y el índice se reconstruye solo).

## Riesgos

- **El texto del hint está aserido en un test** (`grabacion.test.tsx`): se actualiza en la misma rama
  (parte del alcance). Sin sorpresas.
- **`Desarrollo.tsx` no cargaba el índice**: pasa a hacerlo; hay que darle un `getIndex` por defecto en
  el mock de `ajustes.test.tsx` para no romper el test existente de aceleración por hardware.

---

**Estado:** ⏳ pendiente de aprobación
