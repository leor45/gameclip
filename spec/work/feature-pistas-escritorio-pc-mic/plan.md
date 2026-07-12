# Plan — Pistas de escritorio: mezcla + PC + micrófono

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

El cambio real es una rama de `audioTrackLayout()` (helper puro): el layout `desktop + separadas`
deja de ser el legado de dos pistas y pasa a ser un layout **por rol**, como el de juego.

```ts
// desktop + separadas (nuevo)
micMask:     T1 | T3
desktopMask: T1 | T2          // antes: solo T1 (el PC solo vivía dentro de la mezcla)
tracks:      [{1,'default'}, {2,'pc'}, {3,'mic'}]
mixer:       T1 | T2 | T3
named:       true             // ← dispara el remux de nombres, y con eso el editor
```

`named: true` es lo que hace que `ObsCapture.namedTracks()` devuelva las pistas y el manager remuxe
los nombres en el MP4 (`track-names.ts`, ya existente). Con la pista 1 llamada `default` y fuentes
nombradas detrás, `hasRoleTracks()` da true y **el editor ya sabe rehacer la mezcla sin tocar nada
más**: toda la maquinaria de mutear pistas y guardar el edit es genérica sobre el layout por rol.

El resto del pipeline no se entera: en perfil de escritorio la fuente de audio sigue siendo un único
`wasapi_output_capture` (todo el PC), solo cambia a qué pistas se enruta.

La leyenda del editor pasa a distinguir el caso: hoy dice "no tiene pistas por rol (se grabó en modo
escritorio o antes de que existieran)", que con este cambio ya no sería cierto para el escritorio con
pistas separadas.

## Archivos / módulos afectados

- `src/main/capture/obs.ts` — `audioTrackLayout()`: nueva rama `desktop + separadas` (T1/T2/T3,
  `named: true`). Constante para el nombre de la pista del PC (`pc`), junto a `game`/`mic`.
- `src/renderer/views/Editor.tsx` — leyenda del clip sin pistas por rol: "se grabó en modo escritorio
  con un solo audio (o antes de que existieran las pistas por rol)".
- Tests: `src/main/__tests__/obs-helpers.test.ts` (el caso `desktop + separadas` de `audioTrackLayout`
  y el de `effectiveCapture` que afirmaba las dos pistas viejas), `src/renderer/__tests__/editor.test.tsx`
  (leyenda) y un caso en `src/shared/__tests__/tracks.test.ts`: un clip `[default, pc, mic]` es
  layout por rol y ofrece `pc` y `mic` como seleccionables.

## Decisiones y alternativas consideradas

- **Reutilizar el layout por rol existente** en vez de inventar un camino aparte para el escritorio:
  el editor, el remux de nombres y el guardado del edit ya son genéricos sobre "pista 1 = mezcla,
  el resto = fuentes nombradas". Solo hay que producir ese layout.
- **Nombre `pc`** para la pista del audio del sistema (no `desktop`): es el término que usa la UI de
  la sección ("PC y micrófono en pistas separadas") y es lo que verá el usuario como etiqueta en el
  editor, junto a `mic`.
- **Sin migración de clips viejos**: un clip de escritorio ya grabado con el layout de dos pistas
  seguirá comportándose como hasta ahora. Reescribir archivos existentes es riesgo sin beneficio.

## Riesgos

- **Los clips de escritorio pasan a llevar 3 pistas AAC** en vez de 1 o 2: ~160 kbps más por pista.
  Es el mismo coste que ya asumen los clips de juego con pistas separadas, y solo si el usuario
  activa la opción.
- **El remux de nombres ahora corre también en clips de escritorio** (antes solo en los de juego con
  layout por rol). Es best-effort y ya está probado, pero suma un paso de ffmpeg al guardar el clip.

---

**Estado:** ⏳ pendiente de aprobación
