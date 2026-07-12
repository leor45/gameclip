# Tasks — Barra de captura: indicador de juego y duración del clip

## Implementación

- [x] 1. `@shared/games`: `isManualGame(name, customGames)` (puro) — el nombre visible de un juego
      manual es su ejecutable sin `.exe`, así que no hace falta un campo nuevo en el estado.
- [x] 2. `CaptureBar`: píldora de juego (nombre o "Esperando juego") con marca "manual".
- [x] 3. `CaptureBar`: píldora de estado con el punto (buffer / REC) y píldora de duración del clip.
- [x] 4. Selector de duración: presets 30 s · 1 m · 2 m · 3 m · 5 m (dentro de 10–300 s, que es lo que
      valida el dominio), guarda `replaySeconds` y se re-hidrata con `settings:changed`.
- [x] 5. Estilos de píldoras y del botón secundario en `styles.css`.

## Tests unitarios (obligatorios)

- [x] `isManualGame`: coincide sin distinguir capitalización; un juego curado no es manual; sin juego, false.
- [x] Barra: sin juego muestra "Esperando juego".
- [x] Barra: un juego curado NO se marca como manual aunque haya juegos manuales configurados.
- [x] Barra: un juego añadido a mano se marca como manual.
- [x] Barra: el selector muestra la duración configurada y al cambiarla guarda `replaySeconds`.
- [x] Barra (borde): un valor que no es preset (puesto en Ajustes) se muestra igual.
- [x] Barra: un `settings:changed` externo actualiza el control en el acto.
- [x] Los tests existentes (estado, botones, error, último clip) siguen verdes.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 370
- [ ] Comprobación manual: abrir un juego y ver su nombre en la barra; cambiar la duración y
      comprobar que Ajustes → General muestra el mismo valor.

## Cierre

- [x] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
