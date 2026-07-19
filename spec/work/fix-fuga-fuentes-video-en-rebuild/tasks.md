# Tasks — Las fuentes de vídeo se acumulan en cada reconstrucción del pipeline

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. Test de regresión primero (rojo): el teardown elimina los scene items y lo hace antes de
      soltar la escena.
- [x] 2. `OsnSceneItem`: añadir `remove()` al tipado mínimo (ya existe en `ISceneItem` de osn).
- [x] 3. Campo `sceneItems` + guardarlos en `buildPipeline` + eliminarlos en `teardownPipeline`
      antes de `scene.release()`.
- [x] 4. **Ampliación sobre el plan**: la escena seguía renumerando (`gameclip-scene 2`…`7`) tras
      arreglar las fuentes. Causa: el getter `scene.source` entrega un wrapper con su propia
      referencia, y solo se colgaba del canal 1 sin guardarlo. Campo `sceneSource` + `release()`
      en el teardown.
- [x] 5. Vaciar `sceneItems` y `sceneSource` al final del teardown, con el resto del estado.

## Tests unitarios (obligatorios)

- [x] Regresión: elimina los scene items, **antes** de `scene.release()`, y suelta también
      `sceneSource` antes que la escena. El input se sigue soltando (son referencias distintas).
- [x] Caso borde: el teardown deja `sceneItems` vacío para el pipeline siguiente.
- [x] Caso borde: un `remove()` que lanza no tumba el teardown (best-effort, como el resto).

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 875 (+3)
- [x] Comprobación manual — máquina real, juego falso (`cs2.exe`) para forzar transiciones de perfil:

  | Comprobación | Antes | Después |
  |---|---|---|
  | Nombres duplicados tras 6 rebuilds | 6 (`gameclip-scene 2`…`7`) + monitor/game | — |
  | Nombres duplicados tras 12 rebuilds | — | **0** (ni escena ni fuentes) |
  | Fuentes pendientes al cerrar | `9 source(s) were remaining` + timeout | sin línea de pendientes |
  | Clip con imagen | — | 4.86 MB, 0 frames negros, YAVG ≈ 95 |
  | Audio (con tono de 440 Hz de referencia) | — | pista `pc` −28.7 dB, `mic` −91 dB (correcto) |

  Nota: la verificación de audio se hizo con un tono en bucle por la salida por defecto; sin él
  todas las pistas dan −91 dB y el dato no distingue «silencio correcto» de «audio roto».

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
