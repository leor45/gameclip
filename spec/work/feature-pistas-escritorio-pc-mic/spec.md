# Spec — Pistas de escritorio: mezcla + PC + micrófono

**Tipo:** Feature
**Rama:** `feature/pistas-escritorio-pc-mic`
**Fecha:** 2026-07-12

## Problema / Objetivo

Con "PC y micrófono en pistas separadas" (Grabación → Grabación de escritorio), el clip sale con
**dos** pistas: la mezcla completa y el micrófono aislado. El audio del PC **solo existe dentro de
la mezcla**, nunca aislado.

**Causa raíz:** el layout `desktop + separadas` de `audioTrackLayout()` (`src/main/capture/obs.ts`)
es el original de antes del layout por rol: `micMask = T1|T2`, `desktopMask = T1`, y `named: false`.
Sin una fuente aislada nombrada detrás de la mezcla, `hasRoleTracks()` (`src/shared/tracks.ts`) da
false, así que el editor **no puede rehacer la mezcla**: solo deja exportar con audio o sin audio.
Es justo lo contrario de para lo que sirve separar las pistas.

**Objetivo:** que una captura de escritorio con pistas separadas se pueda editar igual que un clip
de juego con apps específicas — pista 1 la mezcla, pista 2 el PC, pista 3 el micrófono —, y que la
leyenda del editor diga la verdad cuando el clip trae una sola pista.

## Alcance

**Dentro:**
- `audioTrackLayout('desktop', separadas=true, …)` pasa a repartir: **T1 `default`** (mezcla) ·
  **T2 `pc`** (audio del PC) · **T3 `mic`**, con `named: true` para que los nombres se remuxen en
  el MP4 y el editor reconozca el layout por rol.
- Sin pistas separadas, el escritorio sigue con una sola pista mezclada (no cambia).
- Editor: la leyenda de "este clip no tiene pistas por rol" pasa a decir que se grabó **en modo
  escritorio con un solo audio** (o antes de que existieran las pistas por rol).

**Fuera (explícito):**
- El layout de juego (`apps` + separadas: `default` · `game` · `mic` · apps) no cambia.
- Los clips ya grabados no se migran: los viejos de escritorio siguen con su layout de dos pistas
  y el editor los trata como hasta ahora (una sola pista seleccionable).
- Nada de nuevos ajustes: el interruptor sigue siendo `desktopAudioTracks`.

## Criterios de aceptación

- [ ] Un clip de escritorio con "PC y micrófono en pistas separadas" trae 3 pistas nombradas
      (`default`, `pc`, `mic`) y el editor deja marcar/desmarcar `pc` y `mic` y **guardar el edit**
      (rehaciendo la mezcla), igual que con un clip de juego.
- [ ] Un clip de escritorio con "todo junto en una pista" sigue trayendo 1 pista, y el editor
      muestra la leyenda nueva: se grabó en modo escritorio con un solo audio.
- [ ] Gates verdes: type-check · lint · tests.
