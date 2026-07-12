# Spec — Pulido de paridad (Fase 6)

**Tipo:** Feature
**Rama:** `feature/pulido-paridad`
**Fecha:** 2026-07-11

## Problema / Objetivo

Cerrar la brecha de experiencia con las apps de clips comerciales en el día a día: hoy el buffer
graba siempre (consume recursos aunque no haya juego), no hay feedback visual mientras se juega (¿está
grabando? ¿se guardó el clip?) y la app vive como una ventana normal (hay que abrirla a mano
y cerrar la ventana la mata). La Fase 6 añade detección automática de juegos con auto-inicio
del buffer, un overlay in-game mínimo y comportamiento de app residente (bandeja del sistema
y auto-arranque con Windows).

## Alcance

**Dentro:**

- **Detección de juegos:** sondeo periódico de procesos (lista curada de ejecutables de
  juegos populares, sin `.exe`, case-insensitive). El juego detectado se expone en
  `CaptureStatus.detectedGame`, se muestra en la barra de captura y se usa como nombre de
  juego al catalogar clips (con prioridad sobre el título de la ventana en primer plano).
- **Auto-inicio del buffer:** nuevo ajuste `bufferMode: 'always' | 'game'` (default
  `'always'`, comportamiento actual). En modo `'game'` el buffer arranca al detectar un
  juego y se detiene al cerrarse (nunca corta una grabación manual en curso).
- **Overlay in-game:** ventana transparente, siempre-encima y click-through en la esquina
  del monitor primario. Muestra el indicador ● REC durante la grabación manual y un toast
  «Clip guardado ✓» unos segundos tras guardar un clip (replay o grabación). Ajuste
  `overlayEnabled` (default `true`).
- **Bandeja del sistema:** icono con menú (Abrir GameClip · Guardar clip · Salir); cerrar
  la ventana la oculta a la bandeja en lugar de salir; el icono cambia mientras se graba.
- **Auto-arranque con Windows:** ajuste `autoLaunch` (default `false`) vía
  `app.setLoginItemSettings` con `--hidden` (arranca minimizada a la bandeja). Solo activo
  en la app empaquetada (en dev registraría `electron.exe`).
- Nuevos ajustes editables desde la vista Ajustes (fieldset «Comportamiento»).

**Fuera (explícito):**

- Overlay sobre juegos en **fullscreen exclusivo** (requiere inyección/hook gráfico tipo
  overlay de Discord; el nuestro cubre borderless/ventana, como cualquier overlay no
  inyectado). Documentado como limitación.
- Base de datos de juegos exhaustiva o detección heurística (ventana fullscreen, GPU, etc.);
  la lista curada es extensible en fases futuras.
- Hotkeys del overlay, chat, ni ninguna interacción con el overlay (es solo informativo y
  click-through).
- Empaquetado/instalador (el auto-arranque queda cableado y probado a nivel de lógica; su
  efecto real se ve con la app empaquetada).

## Criterios de aceptación

- [x] Con `bufferMode: 'game'`, al iniciar la app sin juego el estado queda `idle`; al
      aparecer un proceso de la lista el buffer arranca solo, y al desaparecer se detiene.
- [x] Una grabación manual en curso nunca se detiene por la salida del juego.
- [x] `CaptureStatus.detectedGame` viaja al renderer y la barra de captura lo muestra.
- [x] Un clip guardado con juego detectado se cataloga con ese nombre de juego.
- [x] El overlay muestra ● REC mientras se graba y «Clip guardado ✓» al guardar; con
      `overlayEnabled: false` no aparece nunca.
- [x] Cerrar la ventana principal deja la app viva en la bandeja; desde el menú de la
      bandeja se puede reabrir, guardar clip y salir de verdad.
- [x] `autoLaunch` llama a `setLoginItemSettings` con `--hidden` solo en app empaquetada;
      con `--hidden` la ventana arranca oculta.
- [x] `normalizeCaptureSettings` acepta/normaliza los tres ajustes nuevos con sus defaults.
- [x] Gates verdes: typecheck · lint · tests.
