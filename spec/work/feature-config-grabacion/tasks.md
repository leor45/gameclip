# Tasks — Configuración de grabación + grabación de escritorio

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [ ] 1. Fundación: modelo (`recordingMode`, switching, screenshots, `customGames`,
       `screenMonitorIndex`, `desktopAutoSwitchToGame`) + `findRunningGamesMatch` + canales
       IPC (`get-displays`, `switch-game`, `take-screenshot`) + preload + stubs.
- [ ] 2. Agente A — main: detector multi-juego con juegos manuales, manager (modos,
       switchGame, off), auto-switcher por foco, screenshots, monitor en obs.ts, hotkeys e
       IPC reales, wiring.
- [ ] 3. Agente C — renderer: sección Grabación, modal DisplayPicker con previews, estilos,
       mocks y tests.
- [ ] 4. Revisión del diff por el agente principal.

## Tests unitarios (obligatorios)

- [ ] Normalización de los campos nuevos (modos, hotkeys, customGames con duplicados/exceso,
       screenMonitorIndex fuera de rango).
- [ ] `games.ts`: multi-match con lista curada + manuales (con/sin .exe, case-insensitive).
- [ ] Detector: emite `games-changed` al cambiar el conjunto; juegos manuales detectados;
       compat de `game-started`/`game-stopped`.
- [ ] Manager: modo off (sin buffer, replay/manual no-op) · modo auto (start/stop al
       detectar/cerrar juego, clip registrado) · switchGame rota y re-liga audio · en auto
       corta y arranca.
- [ ] Auto-switcher: 4 sondeos consecutivos con otro juego → switch; foco intermitente no
       dispara.
- [ ] UI: sección renderiza y guarda; alta/baja de juego manual; modal muestra displays
       mockeados y "Empezar a grabar" fija monitor + arranca.

## Verificación (gates)

- [ ] Type-check verde (`npm run typecheck`)
- [ ] Lint verde (`npm run lint`)
- [ ] Tests verdes (`npm run test`)
- [ ] Comprobación manual: selftest E2E — juego falso manual (proceso copiado) detectado y
       modo auto graba/corta solo; screenshot por IPC crea el PNG; grabación del monitor 2
       produce MP4 con la resolución de ese display.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` (tras `fix/reproductor-interno`) — cuando el owner lo pida
- [ ] `spec/constitution/roadmap.md` actualizado
