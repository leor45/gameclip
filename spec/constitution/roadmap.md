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
