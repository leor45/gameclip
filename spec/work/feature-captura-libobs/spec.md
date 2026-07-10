# Spec — Captura nativa con libobs (Fase 3)

**Tipo:** Feature
**Rama:** `feature/captura-libobs`
**Fecha:** 2026-07-10

## Problema / Objetivo

El corazón de GameClip: capturar juegos y escritorio como las apps de clips. Integrar libobs vía
`@streamlabs/obs-studio-node` en el proceso main para (a) grabación manual de escritorio/juego
con audio, (b) **clip retroactivo** con buffer de repetición y hotkey global, y (c) ajustes de
calidad configurables.

## Alcance

**Dentro:**
- Integración de `obs-studio-node 0.26.29b18` (build win64 compilada contra Electron 29):
  init del IPC host, contexto de video, escena con `game_capture` (any_fullscreen, encima) +
  `monitor_capture` (debajo, fallback), audio de sistema y micrófono.
- Grabación manual: iniciar/detener desde la UI; archivos en `Videos/GameClip`.
- Buffer de repetición (clip retroactivo): duración configurable, guardado con **hotkey
  global** (default F8) o desde la UI.
- Ajustes persistidos (JSON en userData): resolución de salida, FPS, calidad, encoder
  (lista real de encoders disponibles: NVENC/AMF/QSV/x264), duración del buffer, hotkey,
  carpeta de salida, micrófono on/off.
- Estado de captura visible en la UI (inactivo / buffer activo / grabando / error) con
  eventos push main → renderer; **degradación elegante** si libobs no inicializa.
- Vista Ajustes real (formulario de los ajustes anteriores).

**Fuera (explícito):**
- Detección automática de juegos y auto-arranque del buffer (Fase 6).
- Overlay in-game (Fase 6).
- Biblioteca/miniaturas/metadatos de clips (Fase 4) — aquí solo se generan los archivos.
- Streaming en vivo. Audio por pista separada. Selección de monitor específico (se usa el
  primario; se anota como mejora).

## Criterios de aceptación

- [ ] Con la app abierta, el buffer de repetición arranca automáticamente y **F8 guarda un
      clip retroactivo** en `Videos/GameClip` (verificable: archivo .mp4 reproducible).
- [ ] Grabación manual: botón inicia y detiene; el archivo aparece en la carpeta de salida.
- [ ] El clip incluye video del escritorio y audio del sistema; micrófono según ajuste.
- [ ] Ajustes muestran los encoders reales de la máquina y los cambios persisten tras
      reiniciar la app.
- [ ] Si libobs falla al inicializar, la app sigue funcionando y muestra el error en la UI.
- [ ] Gates verdes: typecheck · lint · tests (settings, contrato IPC, UI de ajustes y barra
      de captura con API mockeada).
