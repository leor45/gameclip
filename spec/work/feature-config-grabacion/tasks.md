# Tasks — Configuración de grabación + grabación de escritorio

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. Fundación: modelo (`recordingMode`, switching, screenshots, `customGames`,
       `screenMonitorIndex`, `desktopAutoSwitchToGame`) + `findRunningGamesMatch` + canales
       IPC (`get-displays`, `switch-game`, `take-screenshot`) + preload + stubs.
- [x] 2. Agente A — main: detector multi-juego con juegos manuales, manager (modos,
       switchGame, off), auto-switcher por foco, screenshots, monitor en obs.ts, hotkeys e
       IPC reales, wiring.
- [x] 3. Agente C — renderer: sección Grabación, modal DisplayPicker con previews, estilos,
       mocks y tests.
- [x] 4. Revisión del diff por el agente principal.
       *Resultado: 8 hallazgos (6 aplicados) — el clip de una sesión auto se etiquetaba con
       el juego nuevo; switchGame sin serializar (doble stop/start concurrente); tras un
       corte manual el modo auto no reanudaba al cambiar de juego; con forceWindowCapture el
       video no seguía al juego activo; falso éxito silencioso del modal de escritorio;
       colisiones de hotkeys silenciosas. Aceptados como deuda: matching display duplicado
       (ipc/screenshots) y el riesgo del orden de monitores (verificado en esta máquina).*

## Tests unitarios (obligatorios)

- [x] Normalización de los campos nuevos (modos, hotkeys, customGames, screenMonitorIndex).
- [x] `games.ts`: multi-match con lista curada + manuales.
- [x] Detector: `games-changed`, juegos manuales, debounce.
- [x] Manager: modo off · modo auto (start/stop/switch, etiqueta del clip = juego anterior,
       reanudación tras corte manual) · switchGame religa audio y video (forceWindowCapture).
- [x] Auto-switcher: 4 sondeos consecutivos → switch; foco intermitente no dispara.
- [x] UI: sección Grabación, alta/baja de juego manual, modal con displays y aviso de fallo.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 234 tests
- [x] Comprobación manual (E2E real con la app + CDP): juego falso manual `MiJuegoCustom.exe`
       detectado y **modo auto graba/corta solo** (clip de 23 s registrado); screenshot por
       IPC crea el PNG del monitor configurado (1080x1920, display vertical); grabación con
       `screenMonitorIndex=1` produce 1280x720 desde el 2560x1440 primario; `getDisplays`
       devuelve los 2 monitores con preview.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` (tras `fix/reproductor-interno`) — cuando el owner lo pida
- [x] `spec/constitution/roadmap.md` actualizado
