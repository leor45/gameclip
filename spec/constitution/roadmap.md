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
- [x] **Clip retroactivo:** buffer de repetición + hotkey global configurable (F8 por defecto).
- [x] Ajustes de calidad: resolución, FPS, calidad (presets de libobs), encoder (NVENC/AMF/QSV/x264).

> osn `0.26.29b18` desde el S3 de Streamlabs (la versión viva se lee de
> `scripts/repositories.json` del repo de Streamlabs Desktop). Calidad como presets en vez
> de bitrate crudo (el modo Stream de libobs exige streaming configurado). Smoke test sin
> UI: `GAMECLIP_SELFTEST=recording npm run dev`. Verificado en máquina real: clip retroactivo
> F8 de 45 s H.264 1440p60 + AAC y grabación manual.
> Fix post-entrega (2026-07-11, `fix/grabacion-negra-sin-audio`): TODA grabación salía en
> negro y muda. Cuatro causas: la key legacy `monitor` (índice de Electron) no la respeta
> esta build — el monitor va por `monitor_id` (device id, resuelto por tamaño+posición del
> display); DXGI entrega frames negros sin error (HAGS) — método WGC fijo; el loopback de
> escritorio con `use_device_timing` descartaba audio por lag — reloj del OS; y la causa
> del silencio persistente: **el setter `Input.volume` de osn silencia la fuente** (los
> sliders de la Fase 7 lo introdujeron) — el volumen ahora va por `FaderFactory` (fader
> log) y `volume` quedó fuera del tipado. Verificado E2E con ffmpeg: blackdetect limpio y
> tono del loopback en la pista 1 a −12.6 dB con el mic desactivado.

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
> Fix post-entrega (2026-07-11, `fix/biblioteca-cards-uniformes`): los clips 9:16 estiraban
> su card (la imagen participaba del sizing y anulaba el aspect-ratio); imagen absoluta +
> `object-fit: contain` — marco fijo 16:9 y preview completo. Verificado vía CDP.
> Fix post-entrega (2026-07-11, `fix/biblioteca-clips-duplicados`): un clip grabado por la app
> aparecía **dos veces** en la biblioteca. Causa raíz: el catálogo indexaba la ruta cruda de cada
> vía de alta, y no coinciden — `lastFile()` de libobs pega su carpeta con `/`
> (`D:\…\GameClip/clip.mp4`) y el `reconcile()` la arma con `join()` (`\`); como `file_path` se
> comparaba por igualdad de string, el escaneo no reconocía el clip ya registrado y lo insertaba
> otra vez como `scan` (y el archivo se contaba doble en Almacenamiento). Ahora la ruta se
> canonicaliza **en el repositorio** (`resolve()`, frontera única para toda alta o búsqueda), se
> compara con `COLLATE NOCASE` (NTFS ignora mayúsculas) y un índice único case-insensitive lo
> impide desde la DB. Migración que canonicaliza y **fusiona** los duplicados ya creados
> conservando el id menor y los datos de ambas filas (miniatura, duración, favorito, juego,
> etiquetas unidas); el manager borra las miniaturas huérfanas. Verificado sobre una copia de la
> DB real: 3 filas → 2 clips, sin perder miniatura ni duración.

## Fase 5 · Editor de clips — ✅ entregado (base)

- [x] Recorte (trim) con vista previa.
- [x] Exportación (calidad/formato/GIF) y compartir a portapapeles/archivo.
- [x] Pistas de audio por nombre: mostrar, mutear, exportar solo las marcadas y **guardar edit**
      sobre el clip de la biblioteca.
- [ ] Resto de herramientas de un editor completo, de forma incremental (specs propios).

> Exportación con ffmpeg (`ffmpeg-static`) en el main: MP4 (libx264, CRF 18/23/28) y GIF
> (palettegen/paletteuse), `-ss` antes de `-i` (corte exacto al reencodear), progreso por
> `out_time_ms`, cancelable. Portapapeles de archivos vía PowerShell `Set-Clipboard`
> (Electron no expone CF_HDROP). Verificado con recorte real: MP4 2.50 s exactos y GIF.
> Mejora post-entrega (2026-07-11, `feature/editor-pistas-audio`): el editor sondea las pistas
> del MP4 con `ffmpeg -i` (sin añadir ffprobe) y lista las de rol por su nombre (`game`, `mic`,
> `<app>`; la pista 1 `default` es la mezcla derivada y no se lista). **Exportar** mapea las
> marcadas y las suma con `amix=normalize=0` (la misma suma que hace el mixer de libobs) → MP4
> con una sola pista; sin marcadas, `-an`. **Guardar edit** reescribe el clip in-place: la pista
> 1 se re-codifica como mezcla de las marcadas y el video y TODAS las pistas de rol se copian
> (`-c copy`) — nada se borra, así que el edit es reversible y re-guardar no degrada (la mezcla
> siempre se rehace desde fuentes intactas). Temporal + rename atómico; la selección se persiste
> en `clips.muted_tracks` (migración #2) y el reproductor recarga con cache-busting. Los clips
> sin pistas por rol (modo escritorio o previos) muestran una fila "Audio" y no admiten edit.
> Limitación conocida: Chromium solo reproduce la primera pista, así que no hay previa del mute
> antes de guardar. Verificado E2E sobre un clip real de 5 pistas: (mezcla_antes −
> mezcla_después) − mic = −55 dB (lo que se fue es exactamente el mic), pista `mic` intacta,
> video bit a bit idéntico (mismo MD5), mezcla restaurada al re-marcar, y export con solo `mic`
> marcado = 1 pista que es el mic (residuo −67 dB).
> Fix post-entrega (2026-07-11, `fix/guardar-edit-eperm`): "Guardar edit" moría con `EPERM … rename`.
> Causa raíz: **Windows no deja renombrar sobre un archivo abierto**, y el clip lo tenía abierto la
> propia app — el `<video>` del editor lo estaba leyendo por `gameclip-media://` (`stream: true`, que
> sirve el archivo con un handle vivo mientras el reproductor lo tenga cargado). Reproducido aislado
> con `fs`: sobre un destino cerrado el rename va; con un handle abierto, EPERM; al cerrarlo, va otra
> vez. Era intermitente porque un clip chico ya buffereado puede tener el handle suelto. (Y no era que
> "los de escritorio funcionen": esos no tienen pistas por rol y ni siquiera admiten edit.) Arreglo en
> dos capas: el editor **suelta** el video (pause + quitar `src` + `load()`) antes de pedir el
> guardado y lo recarga al terminar —con éxito o con error, si no quedaría en negro—, y el main
> **reintenta** el rename ante EPERM/EACCES/EBUSY con backoff (cerrar el handle es asíncrono, y el
> antivirus o el indexador también pueden tomar el archivo). Si el bloqueo persiste, el mensaje dice
> en español que está en uso, en vez de un EPERM crudo.

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
- [x] Lista de audio por aplicación en modo apps: filas fijas (Audio del juego, Micrófono,
      Discord siempre visible) con checkbox para pausar sin quitar; apps del usuario con
      checkbox + basurero rojo; `audioApps.enabled` en el modelo (migración automática).
- [x] Sección Desarrollo: toggle de aceleración por hardware, aplicado antes de `ready`
      (requiere reinicio; con advertencia en rojo).

> Verificado en máquina real: MP4 con 3 pistas AAC (juego/mic/apps) respetando apps
> deshabilitadas, y arranque con la aceleración desactivada. PTT emite `held` desde el hook
> de bajo nivel y el manager recalcula el mute tras cada rebuild.
> Mejora post-entrega (2026-07-11, `feature/pistas-audio-por-rol`): el reparto de pistas en
> modo apps pasa a ser **por rol y nombrado**: T1 `default` (mezcla completa), T2 `game`
> (juego aislado), T3 `mic`, y una pista por app activa (T4/T5/T6, con el ejecutable sin
> `.exe`) en el orden de la UI. Antes las apps compartían una única pista y el juego no
> tenía pista propia. Tope de 3 apps con audio (libobs solo da 6 pistas y 3 son fijas): la
> normalización desmarca las que sobran y la UI bloquea marcar una 4.ª. Los nombres no los
> escribe libobs, así que se embeben con un remux `ffmpeg -c copy` (atómico, best-effort)
> al cerrar el clip. El modo escritorio queda igual. Verificado E2E: 5 pistas
> `default/game/mic/opera/chrome` en orden, mezcla en la 1 y cada rol aislado.

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

## Fase 10 · Organización del almacenamiento — 🚧 en curso

- [x] Indicador de almacenamiento en el sidebar: anillo con el espacio usado por el catálogo
      sobre el límite configurado (el par de cifras que gobierna el auto-borrado), con enlace a
      Ajustes → Almacenamiento y estado de alerta al pasarse.
- [x] Evento `settings:changed`: el sidebar refleja el cambio de límite al instante.
- [x] Estructura de carpetas por juego (`<carpeta>/<Juego|Desktop>/…`, capturas en `Capturas/`)
      y nomenclatura `<Juego> [Screenshot] AAAA.MM.DD - HH.MM.SS.CC`, con migración de lo viejo.
- [x] Filtro "Escritorio" en la biblioteca: aísla las grabaciones que no vienen de un juego.
- [x] Preview al pasar el cursor: borde blanco en la tarjeta y los primeros 10 s en bucle, mudos.
- [x] Capturas de pantalla en la biblioteca: se ven, se filtran por juego/Escritorio y se gestionan
      como un clip más (sin editor ni preview); cuentan para el límite pero el auto-borrado no las toca.
- [x] Barra de captura nativa: píldoras con el juego capturado (marca "manual" si lo añadió el
      usuario) y la duración del clip retroactivo, editable desde la propia barra.
- [x] Aviso del overlay al detectar el juego: entra deslizándose desde arriba con las hotkeys reales
      y se va solo a los segundos.

> `feature/sidebar-almacenamiento` (2026-07-11): sin canales nuevos — las cifras salen de
> `library:get-storage-stats` (las mismas contra las que el auto-borrado compara el límite, o el
> indicador mentiría) y de `storageLimitGb`. Anillo SVG a mano (dos círculos y un `dashoffset`),
> refrescado con `library:changed`. `formatStorage` pasa a `@shared/library` para que el sidebar y
> la leyenda de Ajustes digan lo mismo.
> `feature/settings-changed-evento` (2026-07-11): el `CaptureManager` ya emitía `'settings'` al
> guardar (Fase 7) pero nadie lo escuchaba; ahora `index.ts` lo puentea a `settings:changed` y el
> preload expone `capture.onSettingsChanged`. El indicador queda con dos fuentes: el catálogo mueve
> los bytes usados y los ajustes, el límite. Emitir desde el manager (y no desde el handler IPC)
> hace que notifique cualquier vía de guardado del main, no solo la que viene de la UI.
> `feature/estructura-carpetas-clips` (2026-07-11): el archivo se **coloca después de guardarlo**,
> no configurando la carpeta de libobs — el juego puede cambiar (foco o F10) sin reconstruir el
> pipeline (reconstruirlo vaciaría el buffer de repetición), así que la carpeta que libobs conoce
> puede estar vencida al guardar. libobs escribe donde quiera y el post-proceso que ya remuxea los
> nombres de pista mueve el clip con un `rename` (mismo volumen → atómico) a
> `<salida>/<Juego|Desktop>/<Nombre> AAAA.MM.DD - HH.MM.SS.CC.mp4`; las capturas van a
> `<Juego>/Capturas/` con `Screenshot` intercalado. Best-effort: si el `rename` falla, el clip se
> queda donde estaba. `sessionGameExe` recuerda el juego de la sesión (al cambiar de juego, el clip
> que cierra es del anterior). El reconcile pasa a ser recursivo y una migración mueve/renombra lo
> que quedó suelto en la raíz, actualizando el catálogo (mismo id → miniaturas y URLs de medios
> siguen valiendo). Verificado sobre copias de la carpeta y la DB reales.
> `feature/filtro-escritorio-biblioteca` (2026-07-11): "sin juego" **no es un juego** — `game` es un
> nombre exacto, así que el filtro va como criterio propio (`ClipsQuery.withoutGame` → `game IS
> NULL`, con precedencia sobre `game`) y el desplegable usa un centinela que traduce el renderer.
> Así un clip cuyo juego se llamara "Escritorio" sigue filtrándose como el juego que es, y no hace
> falta escribir un pseudo-juego en el catálogo.
> `feature/overlay-aviso-juego` (2026-07-11): el contenido lo arma el **main** con una función pura
> (`buildGameNotice`, en `@shared/overlay`), porque el overlay es una ventana aparte y no puede leer
> ajustes — y el aviso depende de ellos: las teclas que muestra son las configuradas y la fila del
> clip dice la duración real del buffer ("el último minuto"). Se dispara en la **transición**
> sin-juego → juego, no con cada `status` (se emite en cada cambio de buffer: reaparecería solo). La
> animación de salida vive en el renderer (el main no sabe cuánto dura una transición CSS: manda
> "quitalo"), y por eso `sync()` demora el `hide()` de la ventana lo justo para que se vea. Sin
> hotkeys activas o en modo `off` no hay aviso: no diría nada útil.
> **Sigue sin verse en fullscreen exclusivo** (como el resto del overlay); la inyección tipo Discord
> queda anotada en Futuro.
> `feature/barra-captura-nativa` (2026-07-11): sin tocar el main — **cero canales nuevos**. El juego
> ya viaja en `CaptureStatus`, y para saber si es manual no hace falta un flag: el nombre visible de
> un juego manual **es su ejecutable sin `.exe`**, así que se deduce cruzándolo con `customGames`
> (`isManualGame`, puro). La duración escribe `replaySeconds` y se re-hidrata con `settings:changed`
> (Fase 10), así que cambiarla en Ajustes actualiza la barra al vuelo. Presets (30 s · 1 m · 2 m ·
> 3 m · 5 m) dentro de los límites que el dominio ya valida: ningún valor del control puede ser
> rechazado por la normalización. Un valor no-preset guardado desde Ajustes se muestra igual.
> `feature/capturas-en-biblioteca` (2026-07-11): el catálogo distingue **qué es** un archivo
> (`kind`: video o imagen, derivado de la extensión) de **de dónde salió** (`source`) — un PNG es una
> imagen tanto si lo guardó la hotkey como si lo encontró el escaneo, así que ningún alta puede
> catalogarlo mal. La captura se registra al tomarla (aparece sin reiniciar) y el escaneo indexa las
> `Capturas/`. Para que se filtren por juego, el juego de lo escaneado **se infiere de la carpeta**
> (`gameFromFolderName`, el inverso de `clipBaseName`), que la Fase 10 hizo fiable; antes todo lo
> escaneado quedaba sin juego. Las capturas llevan miniatura propia (canvas desde `<img>`): pintar
> el PNG entero en cada tarjeta es justo el coste que la app evita mientras se juega. Cuentan para el
> límite pero el auto-borrado las salta (decisión del owner): borrar 2 MB de PNG no libera nada y son
> irrecuperables.
> `feature/preview-hover-biblioteca` (2026-07-11): la preview reproduce el MP4 original por el
> protocolo de medios (ya sirve Range con `stream: true`), sin generar previews en disco ni pasar
> por ffmpeg. **Restricción del owner: la app corre mientras se juega**, así que solo vive la
> preview apuntada — el estado está en la grilla (no un booleano por tarjeta: un `mouseleave`
> perdido dejaría un video decodificando detrás), arranca con 250 ms de retardo (barrer la grilla no
> dispara nada) y al salir el `<video>` se **desmonta**, no se pausa. El bucle de 10 s va a mano en
> `onTimeUpdate` (HTML no acota la reproducción a un rango). Respeta `prefers-reduced-motion`.

## Fase 11 · Distribución — 🚧 en curso

- [x] Build `.exe` **portable** (sin instalador) con la API embebida en el proceso main:
      `npm run build:portable` → `release/GameClip-<version>-portable.exe` (~190 MB).
- [x] Licencia **GPL-3.0** (`LICENSE`): la app enlaza `obs-studio-node` (GPL-2.0, es libobs) y
      redistribuye el `ffmpeg.exe` de `ffmpeg-static` (GPL-3.0-or-later) — el copyleft no es opcional.
      Mismo encuadre que Streamlabs Desktop.
- [x] Ícono propio: mando oscuro sobre baldosa amarilla (`#f5c518`, el acento de la app).
      `build/icon.svg` es la fuente y `npm run icon` genera `build/icon.ico` (7 capas, 16→256 px).
- [ ] Publicar el release en GitHub.

> `feature/build-portable` (2026-07-11): la API va **embebida en el main**, no como proceso hijo —
> un hijo con `ELECTRON_RUN_AS_NODE` corre el runtime de Electron igual, así que necesitaría la
> misma ABI para los nativos y solo sumaría un proceso que supervisar. Eso obligó a que `server/`
> cargue bajo la ABI de Electron: `bcrypt` (nativo) → **`bcryptjs`** (JS puro; los hashes `$2b` ya
> guardados siguen validando, con test de regresión sobre un vector real de bcrypt), y el driver de
> `better-sqlite3` pasa a **inyectarse** (`openDatabase(driver, path)`) para que el main use el
> alias ABI-Electron y `dev:server`/tests sigan con el binario de Node. **En dev nada cambia**: la
> API embebida solo arranca `if (app.isPackaged)`; si no, chocaría con `dev:server` por el puerto.
> La DB del server va a `userData/auth.db` (junto a `library.db`): el portable se descomprime en una
> carpeta temporal distinta en cada arranque, así que `server/data/` se perdería en cada ejecución.
> El detalle que hace fallar los empaquetados con libobs: **`require.resolve()` sigue devolviendo
> rutas `…/app.asar/…` aunque el archivo esté en `asarUnpack`**, y un `.exe` no se ejecuta desde
> dentro del asar — libobs lanza `obs64.exe` desde el working directory que le pasamos y ffmpeg se
> spawnea, así que ambas rutas se reescriben con `unpackedPath()` (`src/main/paths.ts`). Lock de
> instancia única: la segunda ejecución enfoca la ventana de la primera (sin él, dos copias chocarían
> por el puerto fijo de la API). Verificado sobre el `.exe`: API embebida OK, registro/login,
> `obs64.exe` corriendo desde `app.asar.unpacked`, F8 → clip de 36 MB con las 5 pistas nombradas
> (el remux con ffmpeg desempaquetado también corre), y la sesión sobrevive a cerrar y reabrir.
> `feature/icono-app` (2026-07-11): el icono se rasteriza con el **propio Electron** (`npm run icon`),
> sin sumar ninguna dependencia de imágenes: el SVG se dibuja en un `<canvas>` del renderer y se lee
> con `toDataURL`, en vez de `capturePage()` — la captura depende del compositor y en una ventana
> offscreen puede no entregar nunca un frame (se colgaba). El script es `.cjs` porque este Electron
> no arranca con un entrypoint `.mjs`. En el `.ico`, las capas chicas van como **BMP** y solo la de
> 256 como PNG: la API clásica de iconos (GDI+, y con ella parte del shell) no sabe leer entradas
> PNG y las decodifica en basura — verificado leyendo el `.ico` con `System.Drawing` (`#f5c518` y
> `#111318` exactos a 16/32/48 px) y extrayendo el icono ya incrustado en el `.exe`.
> **Bug encontrado durante la verificación, fuera del alcance de esta tarea:** la grabación manual
> deja un MP4 de 261 bytes. Reproducido **también en dev**, así que es previo al empaquetado. Los
> detalles y las pistas quedan en "Bugs abiertos", más abajo.

> Fix post-entrega (2026-07-12, `fix/tray-destruida-al-cerrar`): al cerrar la app **siempre** saltaba
> el diálogo *"A JavaScript error occurred in the main process — Error: Tray is destroyed"* (en dev y
> empaquetada). Causa raíz: el `will-quit` destruía la bandeja **antes** de apagar la captura, y
> `CaptureManager.shutdown()` no es silencioso — emite un `status` final que el handler traduce a
> `tray.setRecording()`, y tocar un `Tray` destruido lanza en Electron. Peor: la excepción abortaba el
> resto del cierre, así que `api.close()` nunca corría y el puerto quedaba tomado. El orden del cierre
> sale a `src/main/shutdown.ts` (testeable) con la regla **primero se apaga lo que emite, después se
> destruye lo que escucha**, y cada paso va en su propio `try/catch` para que el cierre termine
> aunque uno falle. La bandeja además se defiende sola (`isDestroyed()`), para que el bug no vuelva
> por otro emisor. Verificado sobre el `.exe`: sin diálogo, y el puerto 3030 queda libre.

> `feature/adelgazar-portable` (2026-07-12): el `.exe` baja de **190 a 93 MB** y el payload que
> descomprime en cada arranque, de **738 a 418 MB**. De los 707 MB que aportaba osn, solo 90 eran
> libobs de verdad: fuera los **336 MB de símbolos de depuración** (`.pdb`), los **265 MB del
> navegador Chromium embebido** (las *browser sources* de OBS, que la app no expone) y los 14 MB de
> `mediasoup`. Fuera también `ffmpeg-static` (79 MB): osn ya trae su propio `ffmpeg.exe` de 302 KB
> —usa las DLLs de FFmpeg que ya viajan— con `libx264`, `gif`, `palettegen`, `paletteuse` y `amix`,
> que es todo lo que la app usa. Las exclusiones van en `electron-builder.yml`, **no** podando
> `node_modules` (se revertiría en el próximo `npm install`). Un plugin ausente no rompe libobs: lo
> registra y sigue (ya pasaba con decklink y obs-ndi). Verificado con el `.exe` recortado: F8 → clip
> 1080p60 con sus 5 pistas de audio nombradas.
> **El arranque, en cambio, mejoró poco: de ~16 s a ~13,5 s, y la hipótesis inicial resultó falsa.**
> Midiendo por fases, **10 s son la descompresión** y 3,5 s Electron + el main; al recortar el
> payload casi a la mitad, la descompresión no bajó de forma proporcional (LZMA + el antivirus
> escaneando cada archivo nuevo). Se probó `compression: store`: el arranque bajaba a ~11 s pero el
> `.exe` saltaba a 419 MB — cuadruplicar la descarga por 3 segundos no compensa. **~13 s es el piso
> del formato portable**: descomprime 418 MB cada vez que se abre y eso no se evita sin dejar de ser
> portable. Quien arranca al instante es el instalador (descomprime una sola vez) — decisión de
> producto, con su propio spec.
> **Limpieza de temporales:** al cerrar, la app borra las carpetas que dejaron sus ejecuciones
> anteriores (el owner tenía **4,15 GB** acumulados). Tres reglas, cada una tapando una forma de
> hacer daño: solo se toca lo que contiene *nuestro* ejecutable (o `obs64.exe`, porque el launcher
> suele dejar el payload a medio borrar, ya sin el `.exe`, y si no se volvería invisible); se ignora
> lo de la ejecución en curso (el staging lo crea el launcher **antes** que nuestro proceso, así que
> hace falta un margen sobre la hora de arranque, no basta con compararla); y **nunca se borra a
> medias** — la carpeta se renombra primero, y como Windows no deja renombrar una carpeta con
> archivos abiertos, si algo está en uso la operación falla *antes* de destruir nada. Verificado con
> basura fabricada con la forma exacta de la real: borra las cuatro carpetas nuestras y deja intactas
> las de otro instalador NSIS y las de otra app de Electron.

## Bugs abiertos (pendientes de su propia rama `fix/`)

### 🐞 La grabación manual escribe un solo frame (MP4 de 261 bytes)

**Síntoma:** `startRecording()` → `stopRecording()` deja un MP4 de ~261 bytes (la cabecera, sin
vídeo). El log de libobs lo dice sin ambigüedad:

```
Output 'recording': Total frames output: 1
Output 'recording': Total drawn frames: 263
```

**Alcance del daño:** solo la grabación manual (hotkey de start/stop, modo escritorio y el corte de
sesión del modo `auto`, que usa la misma salida). **El clip retroactivo NO está afectado**: la
salida `replay-buffer` saca sus ~300 frames y produce clips correctos — por eso la app parece
funcionar en el uso normal.

**Descartado ya:** *no* lo causa el empaquetado (`feature/build-portable`). Se reprodujo idéntico en
`npm run dev`, así que es previo. Tampoco es de ffmpeg: el archivo ya sale vacío de libobs, antes
del remux de nombres de pista.

**Pista fuerte para el spec:** en el mismo log, justo antes, aparece

```
encoder 'gameclip-venc': Cannot apply a new video_t object while the encoder is active
```

El encoder de vídeo (`gameclip-venc`) es **uno solo y está compartido** entre la salida
`replay-buffer` (activa siempre, por `bufferMode: always`) y la salida `recording`. La hipótesis a
verificar primero es que libobs no admite el mismo encoder alimentando dos salidas activas y la
segunda se queda sin frames. Mirar `src/main/capture/obs.ts` (creación de las Advanced*Output y el
encoder) y `src/main/capture/manager.ts` (arranque de la grabación con el buffer ya corriendo).

**Cómo reproducirlo (sin UI):** `GAMECLIP_SELFTEST=recording npm run dev` — graba 4 s y sale; el
clip queda en la carpeta de salida configurada. Comprobar el tamaño del MP4 y `Total frames output`
en el log de libobs (`userData/obs-data/node-obs/logs/`).

**Recordatorio del flujo:** es un Fix, así que va con **test de regresión primero** (rojo → verde) y
la causa raíz en el `spec.md`.

## Futuro (fuera de alcance por ahora)

- **Overlay in-game por inyección (estilo Discord):** hoy el overlay es una BrowserWindow
  transparente siempre-encima, así que **no se ve en fullscreen exclusivo** — ni el indicador de
  grabación, ni el toast de clip guardado, ni el aviso al detectar el juego. La solución real es
  inyectar en el proceso del juego y dibujar sobre su swapchain (hook de `Present` en
  DX11/DX12/OpenGL/Vulkan), como hacen Discord y el overlay de Steam. Implica una DLL nativa,
  IPC con el main y riesgo de falsos positivos de anticheat: es una tarea propia (spec + plan) y
  probablemente una fase entera, no un ajuste del overlay actual.
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
