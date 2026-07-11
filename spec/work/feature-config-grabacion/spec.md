# Spec — Configuración de grabación (Recorder Settings) + grabación de escritorio

**Tipo:** Feature
**Rama:** `feature/config-grabacion` (apilada sobre `fix/reproductor-interno`; mergear el fix
primero)
**Fecha:** 2026-07-11

## Problema / Objetivo

Paridad con la pantalla Recorder Settings de las apps de clips: modos de grabación, cambio entre juegos,
capturas de pantalla y alta manual de juegos que la detección automática no reconoce. Además,
grabación de escritorio con elección de display (modal con preview de cada monitor, como
las apps de clips) y sub-opciones (cambio automático a captura de juego, selector de display).

## Alcance

**Dentro:**

- **Sección nueva "Grabación"** en Ajustes (primera del sub-nav), con:
  - **Modo de grabación** (radios): `manual` (hotkeys, comportamiento actual) ·
    `auto` (al detectar un juego arranca una grabación de la sesión completa y se detiene al
    cerrarse; los hotkeys siguen funcionando) · `off` (sin grabación: ni buffer, ni hotkey,
    ni grabación manual).
  - **Cambio de juego:** hotkey global (default F10, toggle para activarlo) que rota el juego
    activo entre los juegos conocidos en ejecución (re-liga el audio del juego y renombra la
    detección; en modo `auto` termina la grabación del juego anterior y arranca la del nuevo).
    Toggle de **cambio automático**: si la ventana de otro juego en ejecución queda en primer
    plano ~20 s, se cambia solo (matching por título de ventana, best-effort).
  - **Capturas de pantalla:** toggle + hotkey global (default F6) que guarda un PNG del
    monitor de grabación en `<carpeta de clips>/Capturas` y muestra el toast del overlay.
  - **Detección de juegos:** alta manual de un `.exe` (de la lista de procesos en ejecución o
    texto libre) para juegos que la lista curada no reconoce; lista de juegos añadidos con
    botón de basurero para quitarlos. Los juegos manuales cuentan para detección, buffer por
    juego, audio del juego y nombrado de clips.
  - **Grabación de escritorio:** botón "Grabar escritorio…" que abre un **modal con la vista
    previa de cada display** (thumbnail + nombre + primario) y botón "Empezar a grabar" que
    fija el monitor elegido y arranca la grabación manual. Sub-opciones: selector de monitor
    (editable sin pasar por el modal) y toggle "cambiar automáticamente a captura de juego"
    (ON = el game capture toma el control al lanzarse un juego, comportamiento actual; OFF =
    solo escritorio puro).
- **Detector multi-juego:** `game-detector` pasa a rastrear TODOS los juegos conocidos en
  ejecución (lista curada + manuales) y emite la lista; el manager elige el activo.

**Fuera (explícito):**
- El dropdown Tap/Hold del hotkey de las apps de clips (solo tap).
- Subir los juegos añadidos a una lista comunitaria ("we'll add it to our list!") — sin nube.
- Captura de pantalla del juego exclusivo fullscreen vía hook (se captura el monitor con
  `desktopCapturer`; puede no ver fullscreen exclusivo — limitación documentada).
- Emparejar 1:1 el índice de monitor de libobs con el orden de displays de Electron en
  configuraciones exóticas (se usa el índice; verificado con los 2 monitores de esta máquina).

## Criterios de aceptación

- [x] Modo `off`: no arranca buffer, el hotkey de replay no guarda y grabar manual no hace nada.
- [x] Modo `auto`: al detectar un juego arranca la grabación; al cerrarse el juego se guarda
      el archivo y se registra en la biblioteca.
- [x] El hotkey de cambio de juego rota entre juegos en ejecución y re-liga el audio del juego;
      en modo `auto` corta y arranca grabaciones.
- [x] Con cambio automático activo, enfocar otro juego conocido ~20 s cambia el juego activo.
- [x] El hotkey de captura guarda un PNG en Capturas y el toggle lo desactiva.
- [x] Un `.exe` añadido manualmente se detecta como juego (buffer/audio/nombrado) y puede
      quitarse de la lista.
- [x] El modal de displays muestra un preview por monitor y "Empezar a grabar" graba el
      monitor elegido; el selector de la sección cambia el monitor sin modal.
- [x] Ajustes inválidos caen a defaults campo a campo.
- [x] Gates verdes: typecheck · lint · tests.
