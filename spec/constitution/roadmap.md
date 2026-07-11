# Roadmap — GameClip

Estado por fases. Cada tarea corre el flujo `spec → plan → tasks` en su propia rama.

## Fase 0 · Bootstrap del workflow — ✅ entregado

- [x] Estructura `spec/` (constitution, work, templates, script de scaffolding).
- [x] CLAUDE.md con workflow, git flow y comandos.
- [x] Preferencias multi-agente (local, git-ignored) + template de ejemplo.
- [x] Repositorio git inicializado.

## Fase 1 · Esqueleto de la app — ✅ entregado

- [x] Scaffolding Electron + React + TypeScript con electron-vite (main / preload / renderer / shared).
- [x] Server Express + TypeScript + SQLite en `server/`, mismo repo, un solo `package.json`.
- [x] Test runner (Vitest), ESLint y Prettier operativos — **los gates quedan reales desde aquí**.
- [x] Ventana principal con navegación base (shell de la UI).

> Nota técnica: Electron fijado en **29.3.1** exacto (la versión que usa Streamlabs Desktop,
> cuya build de `obs-studio-node` se compila contra esa ABI). El paquete npm de osn está
> abandonado; en la Fase 3 se instala desde el S3 de Streamlabs.

## Fase 2 · Autenticación — ✅ entregado

- [x] Registro y login directo (email + contraseña) contra el server: JWT access + refresh, bcrypt.
- [x] Sesión persistente en la app (recordar usuario, logout).
- [x] Pantallas de login/registro en el renderer.

> Refresh tokens opacos, hasheados (sha256) y rotados en cada uso; revocables con logout.
> Mejora futura anotada: mover los tokens de localStorage a safeStorage si llegan a dar
> acceso a la nube.
> Fix post-entrega (2026-07-11, `fix/cors-api`): la API no enviaba cabeceras CORS y el
> renderer en dev quedaba bloqueado; habilitado `cors()` con test de regresión.

## Fase 3 · Captura nativa (libobs) — ✅ entregado

- [x] Integración de `obs-studio-node`: inicialización, contexto de video/audio, fijar versión de Electron compatible.
- [x] Grabación manual de escritorio (display capture) con audio de sistema y micrófono.
- [x] Game capture de juegos en primer plano (any_fullscreen, apilado sobre monitor_capture).
- [x] **Clip retroactivo:** buffer de repetición + hotkey global configurable (estilo F8 de las apps de clips).
- [x] Ajustes de calidad: resolución, FPS, calidad (presets de libobs), encoder (NVENC/AMF/QSV/x264).

> osn `0.26.29b18` desde el S3 de Streamlabs (la versión viva se lee de
> `scripts/repositories.json` del repo de Streamlabs Desktop). Calidad como presets en vez
> de bitrate crudo (el modo Stream de libobs exige streaming configurado). Smoke test sin
> UI: `GAMECLIP_SELFTEST=recording npm run dev`. Verificado en máquina real: clip retroactivo
> F8 de 45 s H.264 1440p60 + AAC y grabación manual.

## Fase 4 · Biblioteca de clips — ✅ entregado

- [x] Guardado local de clips con metadatos (juego detectado, fecha, duración, etiquetas) en SQLite.
- [x] Vista de biblioteca: grilla con thumbnails, reproducción, búsqueda y filtros.
- [x] Gestión: renombrar, etiquetar, favoritos, eliminar, abrir carpeta.

> Catálogo en el main (`userData/library.db`) con alias `better-sqlite3-electron` (prebuild
> ABI 121 vía postinstall; el server conserva su binario de Node). Medios servidos por el
> protocolo `gameclip-media://` resuelto por id (el renderer no ve rutas). Thumbnails y
> duración: video → canvas en el renderer, sin ffmpeg. Juego = ventana activa al guardar
> (best-effort); la detección seria llega en la Fase 6.
> Fix post-entrega (2026-07-11, `fix/reproductor-interno`): el CSP de index.html
> (`default-src 'self'`, de la Fase 1) bloqueaba el protocolo de medios — reproductor y
> miniaturas nunca cargaban en la app real; permitido `gameclip-media:` en media-src/img-src
> con test de regresión, y de paso la pista 1 del MP4 ahora siempre lleva la mezcla completa
> (los reproductores solo leen la primera pista).

## Fase 5 · Editor de clips — ✅ entregado (base)

- [x] Recorte (trim) con vista previa.
- [x] Exportación (calidad/formato/GIF) y compartir a portapapeles/archivo.
- [ ] Resto de herramientas del editor de las apps de clips, de forma incremental (specs propios).

> Exportación con ffmpeg (`ffmpeg-static`) en el main: MP4 (libx264, CRF 18/23/28) y GIF
> (palettegen/paletteuse), `-ss` antes de `-i` (corte exacto al reencodear), progreso por
> `out_time_ms`, cancelable. Portapapeles de archivos vía PowerShell `Set-Clipboard`
> (Electron no expone CF_HDROP). Verificado con recorte real: MP4 2.50 s exactos y GIF.

## Fase 6 · Pulido de paridad — ✅ entregado

- [x] Detección automática de juegos en ejecución (auto-inicio del buffer).
- [x] Overlay in-game (indicador de grabación, confirmación de clip guardado).
- [x] Auto-arranque con Windows, minimizar a bandeja del sistema.

> Detección por sondeo de `tasklist` cada 5 s contra una lista curada de procesos
> (`src/shared/games.ts`, ampliable), con debounce de 2 sondeos al cerrar. Nuevo ajuste
> `bufferMode` (`always` default · `game` = buffer solo con juego); el juego detectado
> viaja en `CaptureStatus`, se muestra en la barra y nombra los clips. Overlay como
> BrowserWindow transparente click-through (página `overlay.html`), visible solo grabando
> o con toast — **no cubre fullscreen exclusivo** (requeriría inyección). Cerrar la ventana
> minimiza a la bandeja (menú Abrir/Guardar clip/Salir, icono rojo al grabar); auto-arranque
> vía `setLoginItemSettings` con `--hidden`, solo app empaquetada. Verificado en máquina
> real: proceso falso `Terraria.exe` → buffer auto-on, cierre → auto-off.

## Fase 7 · Settings avanzados (paridad con las apps de clips) — ✅ entregado

- [x] Ajustes desglosados en submenús enrutados: General · Calidad · Audio · Almacenamiento · Avanzado.
- [x] Audio: micrófono por dispositivo (enumeración libobs) con volumen; modo escritorio o apps
      específicas (captura por proceso) con volumen por app y audio del juego detectado;
      pistas de audio separadas en el MP4.
- [x] Calidad: presets de calidad + bitrate 3–100 Mbps (CBR real) o automático (CRF/CQP).
- [x] Almacenamiento: carpeta con diálogo nativo, límite en GB con auto-borrado de los más
      viejos (favoritos protegidos, opción solo-grabaciones, papelera) y barra de uso de disco.
- [x] Avanzado: cursor, HDR→SDR, WGC, captura de ventana forzada, overlays, aspect ratio
      (juego / estirar / barras / recorte 16:9) y buffer disk/memory (persistido; sin efecto
      real hoy, el buffer de libobs vive en RAM).

> Salidas migradas de Simple* a **Advanced*RecordingFactory** (pistas múltiples vía
> `AudioTrackFactory` + bitmask `mixer`, bitrate en el encoder). El detector emite el
> **ejecutable real** del juego y el audio por proceso se religa en caliente con
> `input.update()` (sin rebuild: el replay buffer conserva su contenido). Verificado en
> máquina real con el selftest: MP4 720p60 a ~15 Mbps CBR con 2 pistas AAC separadas, y
> modo apps con pista única y CQP automático. `wasapi_process_output_capture` presente en
> osn 0.26.29; si faltara, degrada a captura de escritorio clásica.

## Fase 8 · Audio avanzado y modo desarrollo — ✅ entregado

- [x] Push-to-talk global (teclado o Mouse4/5) con hook `uiohook-napi`; el mic solo se abre con
      la tecla pulsada, sin reconstruir el pipeline; degradación limpia si el hook no carga.
- [x] Supresión de ruido del micrófono (filtro RNNoise de libobs vía `FilterFactory`).
- [x] Lista de audio estilo de las apps de clips en modo apps: filas fijas (Audio del juego, Micrófono,
      Discord siempre visible) con checkbox para pausar sin quitar; apps del usuario con
      checkbox + basurero rojo; `audioApps.enabled` en el modelo (migración automática).
- [x] Sección Desarrollo: toggle de aceleración por hardware, aplicado antes de `ready`
      (requiere reinicio; advertencia estilo de las apps de clips).

> Verificado en máquina real: MP4 con 3 pistas AAC (juego/mic/apps) respetando apps
> deshabilitadas, y arranque con la aceleración desactivada. PTT emite `held` desde el hook
> de bajo nivel y el manager recalcula el mute tras cada rebuild.

## Fase 9 · Configuración de grabación y escritorio — ✅ entregado

- [x] Modos de grabación: manual (hotkeys) · auto (graba la sesión completa del juego,
      corta al cerrarse o al cambiar de juego) · apagado (sin buffer ni grabaciones).
- [x] Cambio de juego: hotkey global (F10) que rota entre los juegos en ejecución, con
      cambio automático por foco (~20 s, matching por título best-effort); el detector pasó
      a rastrear TODOS los juegos conocidos en ejecución.
- [x] Capturas de pantalla con hotkey (PNG del monitor de grabación en Capturas/ + toast).
- [x] Alta manual de juegos (.exe) que la lista curada no reconoce, con baja desde la UI.
- [x] Grabación de escritorio: modal con preview por display, monitor configurable (lienzo
      y captura del display elegido) y toggle del game capture apilado.

> Verificado E2E en máquina real: juego manual falso detectado → modo auto grabó y cortó
> solo (clip 23 s); screenshot del display configurado; grabación del monitor secundario a
> su resolución. Revisión propia: 6 fixes aplicados (etiquetado de sesión, serialización de
> switchGame, reanudación tras corte manual, re-target de video con forceWindowCapture,
> feedback del modal, colisiones de hotkeys).

## Futuro (fuera de alcance por ahora)

- Guardado en la nube y compartir alojado.
- Login social (Discord, Google, etc.).
- Otras plataformas además de Windows.

## Riesgos conocidos

- **`obs-studio-node`:** compatibilidad estricta Electron/Node, binarios nativos, poca documentación
  (la referencia práctica es el código de Streamlabs Desktop). Es el mayor riesgo técnico del
  proyecto; la Fase 3 empieza con una prueba de integración mínima antes de construir encima.
- **Game capture con anticheats:** algunos anticheats bloquean hooks de captura; puede requerir
  fallback a display capture por juego.
- **Rendimiento del buffer de repetición:** consumo de RAM/disco según duración y calidad del buffer.
