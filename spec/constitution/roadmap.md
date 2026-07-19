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
> Fix post-entrega (2026-07-13, `fix/borrado-clip-archivo-bloqueado`): borrar un clip lo quitaba de la
> app pero **dejaba el archivo en la carpeta**. Misma causa raíz que el fix anterior: el clip lo tiene
> abierto la propia app (el `<video>` de la preview al hacer hover lo lee por `gameclip-media://`), así
> que `rmSync` daba `EBUSY` — pero `deleteClip` lo tragaba y borraba el registro igual, dejando un
> archivo huérfano que además revivía en el siguiente `reconcile`. Reproducido aislado con `fs`
> (handle `FileShare.Read` estilo Chromium → `EBUSY`; liberado → borra). Arreglo: `deleteClip` pasa a
> async y **solo borra el registro si el archivo se fue**, reintentando ante EPERM/EACCES/EBUSY con
> backoff; si persiste, avisa en español y no toca la DB. La tarjeta suelta la preview antes de borrar
> y muestra el error; el auto-borrado por límite salta un clip en uso sin abortar la poda.
> **Editor avanzado (NLE) — Fase 1 (2026-07-14, `feature/editor-avanzado`, en `main` sin release):**
> editor nuevo y aislado (el simple queda igual) en `#/editor-avanzado/:clipId`, abierto desde un botón
> en el editor actual. Timeline con regla, playhead arrastrable y zoom por factor sobre el "fit" al
> ancho (1× llena el timeline; más, scroll). Una fila de vídeo y **una fila por pista de audio
> desglosada** con su **espectro real** (el main extrae cada pista a PCM mono 8 kHz con ffmpeg y reduce
> a picos; canal `ClipGetAudioWaveforms`, best-effort) — la mezcla `default` no se muestra ni se
> renderiza; si el clip no tiene multi-audio, se muestra su única pista. **Volumen 0–200 % por pista**
> (rueda sobre el espectro + slider en cabecera fija que no atenúa el recorte) y **eliminar pista**.
> **Recorte simple** (un rango, zona fuera atenuada) y **render a MP4 nuevo** (calidad/destino, ganancia
> por pista antes del `amix normalize=0`) **sin tocar el original**. Lógica pura en `@shared/timeline`.
> Es la base de un editor multi-fase: **F2** audio en vivo por pista · **F3** cortes múltiples +
> undo/redo · **F4** reencuadre/aspecto · **F5** extras (captura de frame, filmstrip, drafts). Las fases
> se mergean a `main` según se entregan; **el release (0.8.0) se hace una sola vez al terminar las
> cinco.** Verificado E2E por el owner (F1). Versión de la app en desarrollo → `0.8.0`.
> **Editor avanzado — Fase 2 (2026-07-14, `feature/editor-avanzado-f2`, en `main` sin release):**
> **audio en vivo por pista** al reproducir. Antes sonaba la mezcla `default` (lo que oías no reflejaba
> tus cambios); ahora se **reconstruye la mezcla en vivo** con la Web Audio API (una pista → `GainNode`
> → master), colgada del reloj del `<video>` (mudo). Cada pista suena a su volumen actual, las
> eliminadas en silencio, y el cambio de volumen se oye al instante — lo que oyes = lo que se renderiza
> (misma ganancia efectiva). El navegador solo decodifica la mezcla `default`, así que el audio por
> pista lo **extrae el main con ffmpeg a AAC/ADTS** (streamable por stdout, decodificable por Chromium;
> canal `ClipGetTrackAudio`), cargado perezosamente en el primer play. Sincronía por el reloj del vídeo
> con corrección de deriva (umbral 150 ms). **Red de seguridad:** si el audio en vivo no puede sonar
> (sin Web Audio, o ninguna pista decodifica), cae a la mezcla original del `<video>` — nunca silencio
> total. Verificado el grafo en Chromium real (ganancia 1 = señal, 0 = silencio, 0.5 = mitad) y E2E por
> el owner ("funcionando perfectamente").
>
> **Editor avanzado — Fase 3 (2026-07-14, `feature/editor-avanzado-f3`, en `main` sin release):**
> **cortes múltiples** — de "un recorte" a `Segment[]` en tiempo de origen (`@shared/timeline`):
> **dividir** en el playhead (botón/`S`, no divide bajo el mínimo), **borrar** un segmento —incluido
> uno del medio— (clic + basurero/`Supr`, deja ≥1) y **deshacer/rehacer** (botones y
> `Ctrl+Z`/`Ctrl+Y`/`Ctrl+Shift+Z`) sobre un reducer puro con historial. El **render** concatena los
> segmentos conservados (ffmpeg `trim`/`atrim`+`setpts`/`asetpts`→`concat`) manteniendo la mezcla por
> ganancias; con un solo segmento se conserva la ruta rápida `-ss/-t`. El original **no se toca**.
> Durante la E2E el owner pidió **ripple**: borrar **cierra el hueco solo** → la timeline pasa a
> **tiempo de salida** (segmentos contiguos, sin huecos; playhead/regla/ondas/asas en salida, recorte
> de bordes por delta con escala congelada), mientras el `<video>` sigue en origen y el salto de límite
> lo maneja el ripple de reproducción. Dos fixes de reproducción: el salto de hueco se emite **una sola
> vez** (`skipTargetRef`; antes el `rAF` re-emitía el seek en bucle y el vídeo se quedaba pegado con el
> audio distorsionado) y **sin audio "doble"** en el corte (se **silencia el audio durante el seek** del
> vídeo y se re-arranca solo cuando termina de buscar, así imagen y sonido reanudan juntos). Verificado
> render real de 2 segmentos (7.00 s = 3+4, H.264+AAC) y E2E por el owner. 677 tests verdes.
>
> **Editor avanzado — Fase 4 (2026-07-14, `feature/editor-avanzado-f4`, en `main` sin release):**
> **reencuadre por relación de aspecto + reposición** — sacar de un clip 16:9 un vertical 9:16 (o 1:1,
> 4:5, 16:9) encuadrando la acción, sin regrabar. Toda la geometría en `@shared/reframe` (puro): de una
> **geometría canónica única** (rectángulo en píxeles de origen) derivan las **dos** salidas —el
> `transform` CSS de la previa y el filtro de vídeo de ffmpeg—, así **previa = render** por
> construcción. Dos modos de encaje: **recorte** (`cover`: `crop`+`scale`, reposicionable arrastrando +
> zoom con rueda/slider, offset normalizado al margen y clampado) y **barras** (`contain`:
> `scale`+`pad` negro, letter/pillarbox). La previa envuelve el `<video>` en un marco con el aspecto de
> salida (medido con `ResizeObserver`) y lo escala/posiciona para mostrar el mismo rectángulo que
> renderizará ffmpeg; dims de la fuente leídas del `<video>` (`videoWidth/Height`, sin ffprobe).
> **Render:** el reencuadre **fuerza el filtergraph de vídeo** (antes el vídeo iba `-c copy` por
> libx264); se compone con lo de F3 —en concat se recorta **una vez** antes del `split`— y con la mezcla
> por ganancias de F1/2. **Sin reencuadre (`original`) las rutas de render quedan intactas.** Dimensiones
> de salida **pares** (libx264/yuv420p) en el módulo puro; salida conserva la dimensión limitante de la
> fuente (16:9 1280×720 → 9:16 404×720). El reencuadre es **estático** (uno por clip, sin keyframes) y
> no entra en el undo/redo de cortes (ajuste continuo, como el volumen). El editor **simple** no se toca.
> Verificado headless con el ffmpeg de osn: cover 9:16 (404×720), cover 1:1 (720×720), contain 9:16
> (1280×2276) y **concat 2 cortes + reframe** (404×720, 5.00 s). 709 tests verdes (+32). Durante la E2E
> el owner cazó **dos bugs de previa**, ambos por el marco que envuelve el `<video>`: (1) el marco medía
> su ancho del propio `<video>`, que pasa a `position:absolute` al reencuadrar → colapsaba a 0 y oscilaba
> (parpadeo negro/imagen) y el recorte no se aplicaba; arreglado dimensionando el marco desde el **área de
> previa** (contenedor estable, `ResizeObserver`) vía `fitBox`. (2) Con aspecto `original` el `<video>`
> (flex-item, `min-width:auto`) no encogía bajo su tamaño intrínseco y **desbordaba la ventana**;
> arreglado con el `<video>` en `position:absolute`+`inset:0`+`object-fit:contain` (no depende del flex),
> verificado en Chromium headless. **E2E OK por el owner ("funcionando perfecto").** Fuera: rotación,
> pan/zoom animado, reframe por segmento, aspectos libres, GIF (→ nada; el resto es F5: captura de frame,
> filmstrip, drafts).
>
> **Editor avanzado — alto del panel persistente (2026-07-14, `feature/editor-panel-persistente`, en
> `main` sin release):** el alto del panel inferior (transporte + timeline), redimensionable arrastrando
> el divisor, ahora **se recuerda entre sesiones y entre clips**. Es una pref de UI del renderer →
> `localStorage` (clave `gameclip.editor.panelHeight`, igual que `gameclip.session`), sin tocar main/IPC
> ni el settings de captura. Lógica pura en `renderer/lib/editor-prefs.ts` (`clampPanelHeight`,
> `panelMax`, `load/savePanelHeight`, best-effort): se guarda al **soltar** el arrastre y al abrir se
> **acota** al alto de la ventana actual (un valor de una ventana mayor no deja el panel fuera de
> pantalla). 715 tests verdes (+6). Fuera: persistir otras prefs del editor (zoom, volúmenes, reencuadre)
> y sincronizar entre máquinas.
>
> **Editor avanzado — Fase 5 (2026-07-15, `feature/editor-avanzado-f5`, en `main` sin release):**
> **extras** que cierran el editor (últimas de las cinco fases). Tres piezas:
> — **Ediciones sin terminar ("drafts"):** el estado de edición (cortes + volúmenes + pistas quitadas +
> reencuadre) se **auto-guarda por clip** en `localStorage` (`gameclip.editor.draft.<id>`) en cuanto
> difiere del estado recién abierto, y se **restaura** al reabrir; volver al estado base (o **Restablecer**)
> lo borra. Lógica pura en `renderer/lib/editor-drafts.ts` (`sameEdit`, `save/load/delete/listDrafts`,
> tolera corruptos). La pestaña **Editor** (sin clip) lista las ediciones sin terminar con **Retomar** y
> **Quitar** (si el vídeo ya no está en la biblioteca, lo dice en lenguaje sencillo); sin ninguna, mensaje
> mejorado. **Toda la copy es sencilla** — "draft" solo vive en el código.
> — **Captura de fotograma (📷):** guarda el frame actual **con el reencuadre aplicado** (canvas con la
> misma geometría de `@shared/reframe`: crop/pad/original) como PNG en la carpeta **Capturas** del juego y
> lo **da de alta en la biblioteca** (canal `ClipCaptureFrame` → helper `frame-capture.ts` con
> `targetPathFor`+`registerSavedClip`), sin diálogo, con aviso breve.
> — **Filmstrip real:** la pista de vídeo muestra ~16 **miniaturas** muestreadas en tiempo de **salida**
> (`filmstripSampleTimes`, respeta los cortes) y mapeadas a origen, extraídas perezosamente (un `<video>`
> oculto + `canvas`, serie) y **cacheadas por clip**; best-effort (barra vacía si falla). No re-muestrea al
> hacer zoom (se estira). Verificado el helper del main con PNG real a disco; 736 tests verdes (+21).
> Fuera: filmstrip denso por zoom, diálogo "Guardar como" del frame, drafts en el main/entre máquinas,
> anotaciones.
>
> **Fixes tras la E2E del owner (15 jul):** durante la validación, 📷 y el filmstrip fallaban en la app
> real (no en los tests). (1) **📷:** `sourceDims` se fijaba solo en `onLoadedMetadata` —evento que se
> pierde si la metadata ya estaba en caché (se llega desde el visor simple) o reporta `videoWidth 0`—,
> dejándolo nulo → botón deshabilitado → clic muerto. Ahora se fija también en `onLoadedData` (+ fallback
> leyendo las dimensiones del `<video>` al capturar). (2) **Filmstrip:** al montar, con duración 0, los
> tiempos de muestreo salían vacíos y se **cacheaba vacío** sin reintentar; ahora espera la duración real
> (dep `[clipId, duration]`), no cachea vacíos y reintenta. Regresión para ambos. 742 tests verdes.
>
> **Editor avanzado COMPLETO — release 0.8.0 (2026-07-15).** Las cinco fases (F1 esqueleto · F2 audio en
> vivo por pista · F3 cortes múltiples + undo/redo · F4 reencuadre/aspecto · F5 extras) más el alto del
> panel persistente, entregadas y publicadas como **v0.8.0** (portable). Verificado E2E por el owner.

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
> Mejora post-entrega (2026-07-12, `feature/silenciar-haptico-dualsense`): opción opt-in
> (Ajustes → Audio → Mando, apagada por defecto) para que la **vibración háptica del DualSense**
> —que el mando transporta como audio y en modo apps se cuela por la captura del proceso del juego—
> no acabe en el clip. Replica automáticamente el arreglo manual (mutear la sesión de `obs64.exe` en
> el dispositivo del mando): un helper nativo propio (`native/app-audio-mute`, Core Audio
> `ISimpleAudioVolume::SetMute`, compilado estático con `build-haptic-mute.ps1`, git-ignored y
> generado en `build:portable`) que el manager reaplica —fire-and-forget, con reintento hasta que
> la sesión aparece— en cada arranque de buffer/grabación. Best-effort: sin binario o sin mando es
> no-op. Verificado en máquina real: con la opción activa, cada arranque de `obs64.exe` mutea el
> audio hacia el dispositivo DualSense y el zumbido deja de colarse.
> Fix pre-lanzamiento (2026-07-12, `fix/haptico-dualsense-event-driven`): la reaplicación por
> arranque de captura no bastaba —la sesión de `obs64.exe` en el DualSense no se crea hasta que el
> mando emite audio (al pulsar un botón), tarde e impredecible—, así que a veces no muteaba hasta
> reabrir Ajustes. El helper pasa a **listener persistente event-driven** (`--watch`):
> `IAudioSessionNotification` mutea la sesión en cuanto `OnSessionCreated` dispara, e
> `IMMNotificationClient` re-escanea al conectarse un mando nuevo; sale por EOF de stdin (sin
> huérfano). En reposo no consume CPU. El manager gestiona su ciclo de vida (init/settings/shutdown)
> en vez de reaplicar por captura. El patrón de dispositivo deja de ser editable: la UI queda
> plug-and-play (solo el toggle; detecta DualSense automáticamente). Verificado por el owner:
> mutea al pulsar el botón sin reabrir Ajustes, y cubre desconexión/reconexión y un segundo mando.
> Como la 0.5.0 no llegó a lanzarse, el arreglo va junto a la feature en la 0.5.1.

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

## Fase 12 · Perfil de captura (escritorio vs juego) — ✅ entregado

- [x] La captura tiene un **perfil** derivado de los ajustes + la detección de juego
      (`captureProfile`): `game` · `desktop` · `none`. De él salen la escena y las fuentes de audio.
- [x] Grabando el escritorio se captura **todo el audio del PC**: el audio por aplicación y las
      pistas por rol quedan reservados a las capturas de juego. Las pistas del clip de escritorio
      las elige `desktopAudioTracks` (todo junto · PC y micro separados).
- [x] El check de auto-switch **cambia la fuente de verdad**: al lanzarse un juego se graba solo el
      juego. Desmarcado, se sigue grabando el monitor aunque haya un juego corriendo.
- [x] `desktopRecordingEnabled`: se puede apagar la grabación de escritorio. Sin juego y sin
      escritorio no se captura nada (buffer parado; grabar/replay devuelven el motivo).

> `feature/captura-escritorio-vs-juego` (2026-07-12): la escena pasa a llevar **una sola fuente de
> vídeo**. Antes siempre había `monitor_capture` de fondo y el `game_capture` se apilaba encima en
> `any_fullscreen` esperando "ganar": si no enganchaba (juego en ventana sin bordes) se grababa el
> escritorio entero — el auto-switch no cambiaba nada de verdad. Ahora el perfil elige la fuente y,
> con el ejecutable del detector, el game capture va en modo `window` (engancha también sin bordes).
> El precio: cambiar de perfil obliga a **reconstruir el pipeline** (las fuentes de audio y el
> bitmask de pistas de las salidas son otros, y eso no se reasigna en caliente), así que el replay
> buffer se reinicia al aparecer/desaparecer un juego. Una grabación en curso **nunca** se corta: el
> rebuild queda pendiente y se aplica al terminarla. Versión de la app → `0.2.0`.
>
> La E2E destapó una carrera que ya existía y que esta fase volvía probable: `startRecording` /
> `stopRecording` / `saveReplay` **no pasaban por la cola** de mutaciones del pipeline. Un juego
> detectado justo al pulsar grabar reconstruía el pipeline con la salida a medio arrancar y la señal
> `start` de libobs no llegaba nunca ("timeout esperando señal 'start' de recording", grabación
> muerta). Encoladas, el rebuild ve el estado `recording` ya asentado y se aplaza. Verificado en
> máquina real con los ajustes del owner (audio por apps + pistas separadas): clip de escritorio con
> 1 pista y el audio del PC dentro; clip de juego con las pistas por rol; y grabación en curso +
> juego lanzado → clip entero.
>
> Fix (2026-07-12, `fix/audio-video-source-bleed`): al pasar el perfil `game` a usar `game_capture`
> como única fuente de vídeo, esta fase introdujo un **bleed de audio**: `game_capture` (y el
> `monitor_capture` WGC) traen `capture_audio` activo y nunca se les asignaba `audioMixers`, así que
> su audio iba a **todas las pistas** (default `0x3F`) **sin fader**. Resultado: el juego duplicado en
> la mezcla y en la pista `game` (con phasing), colado en `mic`/`discord`/etc., y a volumen completo
> aunque se bajara en Ajustes (el fader solo toca la fuente wasapi). Arreglo: `capture_audio: false`
> en ambos helpers; el audio fluye solo por las fuentes wasapi dedicadas, con su reparto por rol y su
> fader. Verificado por el owner en captura real. Versión de la app → `0.4.3`.

## Fase 13 · Pistas del escritorio editables — ✅ entregado

- [x] Escritorio con "PC y micrófono en pistas separadas" pasa a **layout por rol**: T1 `default`
      (mezcla) · T2 `pc` (audio del PC aislado) · T3 `mic`. Antes el PC solo vivía dentro de la
      mezcla (T1 mezcla + T2 mic, sin nombres), así que `hasRoleTracks()` daba false y el editor
      **no podía rehacer la mezcla**: separar las pistas no servía para nada.
- [x] Con `named: true` el remux de nombres corre también en los clips de escritorio, y el editor
      los trata igual que a los de juego (marcar/desmarcar fuentes y guardar el edit).
- [x] La leyenda del editor distingue el caso: un clip de una sola pista dice que se grabó "en modo
      escritorio con un solo audio".

> `feature/pistas-escritorio-pc-mic` (2026-07-12): no hizo falta tocar el editor para que funcione —
> mutear pistas y guardar el edit ya eran genéricos sobre "pista 1 = mezcla, el resto = fuentes
> nombradas"; bastó con producir ese layout desde la captura. Verificado en máquina real: clip de
> escritorio con 3 pistas nombradas, el tono del PC aislado en `pc` (−28,6 dB) y el micro en `mic`.
> Los clips ya grabados no se migran.

## Fase 14 · Sección Atajos — ✅ entregado

- [x] Sección **Atajos** en Ajustes: una fila por acción (guardar clip · grabar/detener · captura ·
      cambio de juego) con su tecla actual y **captura de la pulsación** al estilo Discord (clic en
      "Editar atajo…" → teclea la combinación; `Esc` cancela). Botón de restablecer los defaults.
- [x] Atajo nuevo `recordingHotkey` (`F7`): arranca la grabación normal y, pulsado otra vez, la corta
      y guarda el clip. Antes solo se podía grabar desde la UI.
- [x] Las colisiones **se ven y bloquean el guardado**; la tecla del push-to-talk queda reservada
      (mismo teclado físico aunque el motor sea otro) y se rechaza al capturarla, con su leyenda.
- [x] En General y Grabación los atajos pasan a informativos, con enlace a la sección.

> `feature/seccion-atajos` (2026-07-12): el catálogo de acciones vive ahora en `src/shared/hotkeys.ts`
> y lo comparten el registro global del main y la UI — antes el main tenía las acciones escritas a
> mano y el renderer las repetía pieza a pieza, así que añadir el atajo de grabación salió casi
> gratis. Dos agujeros que esto tapa: los atajos se escribían en un `<input>` libre y un valor
> inválido fallaba **en silencio** (el `catch` de `globalShortcut.register` estaba vacío), y dos
> acciones con la misma tecla se resolvían descartando la segunda con un `console.warn` que nadie
> veía. Verificado en máquina real: la sección lista las teclas configuradas y **pulsar F7 grabó y el
> segundo F7 cortó y guardó el clip**. El PTT sigue en Audio: usa otro motor (uiohook), con lista
> blanca cerrada y sin combinaciones.

### 🐞 Clip negro en perfil de juego — ✅ arreglado (`fix/game-capture-negro`, 2026-07-12)

Introducido por la v0.2.0 (`58f9c7c`): al pasar a una sola fuente de vídeo, el `game_capture` se
apuntaba en modo ventana con `window: '::<exe>'`. **Las fuentes de VÍDEO de libobs no matchean esa
forma abreviada** — solo vale para el audio por proceso (`wasapi_process_output_capture`, otro
matcher), de donde se copió. El source quiere la cadena COMPLETA `título:clase:exe` que él mismo
lista en su propiedad `window`; con `::<exe>` no enganchaba nada y, sin monitor de fondo, el clip
salía negro. Sonda en máquina real (Miles Morales corriendo): `any_fullscreen` → 2560×1440;
`::MilesMorales.exe` → **0×0**; cadena completa → 2560×1440.

Arreglo: `resolveGameWindow()` resuelve la ventana contra la propiedad-lista del source ya creado
(mismo patrón que `resolveMonitorId`, el bug hermano del monitor equivocado) y el capture se apunta
con la cadena completa; sin ventana que resolver, `any_fullscreen` — nunca apuntando a una ventana
inexistente. Verificado con el juego real: el clip muestra el juego, sin nada del escritorio.

## Fase 11 · Distribución — ✅ entregado

- [x] Build `.exe` **portable** (sin instalador) con la API embebida en el proceso main:
      `npm run build:portable` → `release/GameClip-<version>-portable.exe` (~190 MB).
- [x] Licencia **GPL-3.0** (`LICENSE`): la app enlaza `obs-studio-node` (GPL-2.0, es libobs) y
      redistribuye el `ffmpeg.exe` de `ffmpeg-static` (GPL-3.0-or-later) — el copyleft no es opcional.
      Mismo encuadre que Streamlabs Desktop.
- [x] Ícono propio: mando oscuro sobre baldosa amarilla (`#f5c518`, el acento de la app).
      `build/icon.svg` es la fuente y `npm run icon` genera `build/icon.ico` (7 capas, 16→256 px).
- [x] Publicar el release en GitHub (`v0.3.1`, portable): https://github.com/leor45/gameclip/releases

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

> Release v0.7.2 (2026-07-14): dos fixes publicados como una sola versión.
> — `fix/auto-inicio-portable`: "Iniciar con Windows" registraba `process.execPath`, que en el
> portable es la copia efímera en `%TEMP%\GameClip-<version>\`, así que Windows apuntaba a un
> ejecutable fantasma y la app no arrancaba. Ahora registra la ruta real vía
> `PORTABLE_EXECUTABLE_FILE` (cae a `execPath` fuera del portable). La entrada usa un nombre estable
> (`electron.app.GameClip`) y se re-registra en cada arranque, así que **se auto-repara** al abrir la
> versión nueva. Lógica en `src/main/auto-launch.ts` (pura, con test de regresión).
> — `fix/ui-settings-biblioteca`: en Ajustes, un `<fieldset>` ignora el ancho del padre (su
> `min-width` por defecto es `min-content`), así que crecía con la fila de alta de juego y desbordaba
> el panel — `min-width:0` en `.settings-form fieldset` lo contiene (verificado midiendo el layout
> real en Chromium: `formScrollWidth` 706→460). En la Biblioteca, la card muestra el **tamaño del
> archivo** (`formatFileSize`), los iconos llevan **tooltip** y la ✕ pasa a **basurero rojo**.

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

> Fix post-entrega (2026-07-12, `fix/limpieza-temporales-cierre-sucio`): aquella limpieza **solo corría
> al cerrar**, así que un cierre sucio —apagar el PC sin cerrar la app, un cuelgue, un kill— dejaba
> entre **94 y 515 MB** que ya no se borraban nunca. Con el auto-arranque activado eso se repite en cada
> encendido: es el origen real de los 4,15 GB. Dos causas: (1) nadie limpiaba **al arrancar**, que es la
> única red que atrapa un cierre que no pasó por el `will-quit`; y (2) parte de la basura era
> **irreconocible**: al morir, el launcher alcanza a borrar el `7z-out` del staging pero no el
> `app-64.7z`, y lo que queda es idéntico al staging de cualquier otra app de electron-builder — barrerlo
> por contenido se llevaría temporales ajenos. Arreglo: la limpieza corre también al arrancar, y **cada
> ejecución anota la ruta de su propio staging** (`userData/portable-temp.json`) mientras aún es
> reconocible; la siguiente la borra por lo que *era*, sin adivinar. Verificado sobre el `.exe` con tres
> ciclos apagón→arranque (matando también al launcher, como un corte de luz): antes crecía 684 MB →
> 1031 MB y subiendo; ahora se queda en **2 carpetas** (payload + staging vivos) ciclo tras ciclo.
> **Dos errores de diseño que solo aparecieron contra el `.exe` real:** el filtro de edad tomaba el
> staging huérfano por el de la ejecución en curso si el PC reiniciaba en menos de un minuto (una ruta
> registrada nunca puede ser la actual: la actual es una carpeta aleatoria recién creada, así que se
> salta ese filtro); y del **segundo arranque en adelante el launcher no crea `7z-out`** —el payload ya
> está extraído—, así que usarlo como marcador dejaba el staging sin registrar justo en el caso más
> común. El marcador es `app-64.7z`, que está siempre.
> **Lo que el fix NO recupera** (medido, fabricando la basura de un usuario que viene de la 0.3.1): al
> actualizar se limpia el grueso —el payload viejo (~400 MB) y los stagings con marcador (~500 MB), y
> ahora ya **al arrancar**—, pero los stagings "invisibles" que quedaron **de antes del fix** (~94 MB
> cada uno) sobreviven: nadie anotó su ruta, y por dentro son idénticos a los de cualquier otra app de
> electron-builder, así que borrarlos sería meterse con temporales ajenos. Son restos históricos y ya no
> se generan más. Se documenta en las notas del release v0.4.1, con la instrucción de borrarlos a mano.
> Publicado como **v0.4.1** (portable): https://github.com/leor45/gameclip/releases/tag/v0.4.1
>
> Hotfix (2026-07-12, `hotfix/borrar-adoptado-como-staging`): la 0.4.1 **seguía acumulando 118 MB por
> ciclo**. Lo cazó el owner al ver un `nsl4E5E.tmp.borrar` en su temporal. El `.borrar` es el paso
> intermedio del borrado (se renombra antes de borrar, regla 3), y ese reintento nunca ganaba, por dos
> motivos encadenados. (1) Al renombrar, la carpeta conserva su `app-64.7z` y estrena mtime: durante el
> margen de 60 s era indistinguible del staging en curso, se **adoptaba como propia** y se saltaba. (2) El
> grave: `rmSync` moría con `EBUSY` sobre `7z-out\resources\app.asar` —y el Restart Manager señaló a
> **nuestro propio proceso**—. Electron intercepta todo `fs` cuya ruta lleve un `.asar`, lo trata como
> archivo empaquetado y **deja el handle cacheado para siempre**: el propio borrado abría el fichero que
> intentaba borrar y se bloqueaba a sí mismo. Como `rmSync` aborta al primer error, la carpeta quedaba a
> medias (93 MB de `app-64.7z` intactos) y **ningún arranque posterior podía rematarla**: se volvía a
> bloquear sola. Por eso la 0.4.1 pasó su verificación: en aquellos ciclos el launcher no extraía nada y el
> staging **no tenía `7z-out`** — sin `.asar` en el árbol, sin bloqueo. Arreglo: un `.borrar` nunca es el
> staging en curso, y el borrado corre con `process.noAsar = true` (`sinAsar()`). Verificado sobre el
> `.exe`: tres apagones seguidos dejan el temporal **plano en 937 MB** (payload + staging), sin residuo.

## Fase 15 · Detección de juegos instalados y nombres reales — ✅ entregado

- [x] **Índice de juegos instalados**: la app lee lo que los launchers dejan en el PC y sabe qué juegos
      hay. Fuentes con contrato único (`GameSource`), todas fail-soft: **Steam** (`libraryfolders.vdf` +
      `appmanifest_*.acf`), **Epic** (manifiestos `.item`), **Xbox** (`MicrosoftGame.config`), **GOG**
      (registro) y una fuente genérica sobre el **registro de desinstalación** que cubre Ubisoft Connect,
      EA App y Battle.net de una pasada. Caché en `userData/games-index.json` con huella; se reconstruye
      en background y **el sondeo de procesos sigue costando lo mismo** (`tasklist` + un mapa en memoria).
- [x] Un juego instalado se detecta **sin darlo de alta a mano**, y con su nombre de catálogo: Arc Raiders
      arranca `pioneergame.exe` y se muestra como `ARC Raiders`.
- [x] **Nombre visible con una prioridad única** (`resolveGameName`): nombre manual del owner → índice de
      launchers → lista curada → `FileDescription` del `.exe` → ejecutable. El `.exe` sigue siendo la
      identidad interna (captura, targeting de ventana, pistas de audio).
- [x] **Alta manual con nombre opcional**, pre-rellenado con lo que la app deduzca, y renombrable después.
      `customGames: string[]` → `CustomGame[]` (`{ executable, name? }`), con migración de lo ya guardado.
- [x] Los clips se guardan con el **nombre del juego**, saneado para Windows (`Marvel's Spider-Man: Miles
      Morales` → carpeta `Marvel's Spider-Man Miles Morales`), y los ya grabados bajo el ejecutable
      (`acblackflag/`) se **re-etiquetan en la BD sin moverse del disco**: la Biblioteca los muestra en la
      misma entrada que los nuevos.
- [x] Publicado como **v0.4.0** (portable): https://github.com/leor45/gameclip/releases/tag/v0.4.0
      Verificado sobre el `.exe` empaquetado: construye el índice igual que en dev (66 ejecutables, nombres
      correctos), así que las fuentes no sufren el problema de rutas dentro del `asar`.

> `feature/deteccion-juegos-y-nombres` (2026-07-12): la detección **no estaba rota, estaba ciega**. La
> única fuente de juegos era `KNOWN_GAME_PROCESSES`, una lista curada de ~40 procesos: todo lo que no
> estuviera en ella había que añadirlo a mano. El dato bueno ya estaba en disco — el `appmanifest` de
> Steam de `MilesMorales.exe` dice literalmente `Marvel's Spider-Man: Miles Morales`—, así que el arreglo
> fue leerlo, no inventar una heurística de "¿esto es un juego?" (que además no habría dado el nombre).
> Se indexan **todos** los `.exe` de la carpeta del juego, no el que declara el manifiesto: el
> `LaunchExecutable` de Fortnite es un bootstrapper y el proceso real es `FortniteClient-Win64-Shipping.exe`.
> **El bug que solo aparece contra datos reales:** con eso, la app detectaba **Fortnite a todas horas** —
> `EpicWebHelper.exe` vive dentro de la carpeta de Fortnite pero lo arranca el launcher de Epic y corre
> siempre. De ahí dos reglas: la blacklist descarta helpers/launchers/bootstrappers, y un ejecutable que
> aparece en **dos juegos** se descarta por ambiguo (quedarse con el primero es peor que no tenerlo: basta
> con que ese proceso corra para detectar el juego equivocado). Ruido: de 79 ejecutables a 66, cero falsos
> positivos. La carpeta del clip pasa a ser el **nombre** y no el ejecutable, lo cual es seguro porque OBS
> graba a un temporal y es Node quien mueve el fichero — los caracteres raros no llegan a libobs. Y no hay
> que mover nada de lo viejo: `gameFromFolderName()` resuelve tanto la carpeta vieja (el ejecutable) como
> la nueva (el nombre saneado) al **mismo** nombre, así que el juego no se parte en dos en la Biblioteca.
> Verificado en la máquina del owner: 31 juegos y 66 ejecutables indexados, los 12 clips de `acblackflag/`
> ya se ven como `Assassin's Creed Black Flag Resynced`, y un juego falso llamado `Prueba: El Juego™` se
> detecta, se guarda en `Prueba El Juego/` y se cataloga con su nombre exacto.
>
> **Sin verificar de extremo a extremo:** las fuentes de Ubisoft, EA, GOG, Battle.net y Xbox. El owner las
> tiene instaladas pero **sin un solo juego**, así que su lógica solo está probada con fixtures. Cada una
> está aislada: si el formato no es el esperado, devuelve `[]` y el resto del índice sigue igual.

## Fase 16 · Comprobación de actualizaciones — ✅ entregado

- [x] Chequeo silencioso al arrancar contra `releases/latest` de GitHub; si hay versión nueva, modal
      propio (una vez por lanzamiento) con botón "Ver release".
- [x] Aviso pasivo en el sidebar mientras la app corre + botón "Comprobar actualizaciones" con feedback
      ("Estás al día ✓" / "Hay vX.Y.Z").

> Feature de la 0.6.0 (`feature/comprobar-actualizaciones`). Es un **notificador**, no un auto-updater:
> abre el release en el navegador (`window.open` → `setWindowOpenHandler` → `shell.openExternal`) y la
> descarga del portable sigue siendo manual; el auto-update real (electron-updater + firma) queda fuera.
> Todo el I/O vive en el main (`src/main/updates.ts`, Electron `net`, sin CORS/CSP), con timeout de 5 s
> y `catch` total: cualquier fallo (offline, rate-limit, JSON raro) es "no hay update" en silencio. El
> repo es público, así que `GET /repos/leor45/gameclip/releases/latest` va sin token. Comparación de
> versiones propia en `@shared/version.ts` (numérica `X.Y.Z`, sin dependencia nueva). Verificado por
> tests (versión, chequeo con `net` inyectable, contexto/sidebar/modal en el renderer) y contra el
> payload real de la API; la comprobación visual final la hace el owner con la versión bajada a mano.
> El 0.6.0 incluye además el fix de borrado sin publicar (ver Fase 10 / `fix/borrado-clip-archivo-bloqueado`).

## Fase 17 · Botón de captura de mandos — ✅ entregado

- [x] Ajuste "Habilitar botón de captura de mandos" (Ajustes → Atajos, por defecto off): el botón
      dedicado del mando guarda un clip, igual que el atajo de replay, en paralelo a los atajos de teclado.
- [x] Helper nativo `gc-controller-listen` con dos vías: **HID crudo** para el botón Create del
      **DualSense** (USB/BT) y **GameInput** para el botón Compartir del **Xbox** (USB/BT).
- [x] En el overlay de aviso de juego, línea "Captura con mandos habilitada" cuando la opción está activa.

> Feature de la 0.7.0 (`feature/boton-captura-mandos`). El botón de captura no sale por XInput, así que
> hay dos caminos: el DualSense se lee por **HID** (bit Create del input report, offsets por USB/BT); el
> botón Compartir del Xbox **por USB solo existe vía GameInput** (su hijo HID es únicamente XInput, sin
> ese botón) — la misma API que usa Game Bar. **Pieza clave descubierta en la espina:** sin
> `SetFocusPolicy(GameInputEnableBackgroundShareButton)` el callback solo llega con foco en primer plano
> (dio 0); con él, llega en segundo plano, que es el caso real (GameClip en la bandeja mientras juegas).
> El helper calca el patrón de `gc-app-audio-mute` (proceso hijo, stdout `capture` por pulsación en el
> flanco, EOF de stdin para salir). GameInput es una **dependencia de runtime blanda**: inbox en Win11
> 24H2+, redist en otros (app *Accesorios de Xbox*); si falta, la vía Xbox es no-op y el DualSense sigue.
> `GameInput.h` **no se vendoriza** (GameClip es GPL-3.0 y la licencia del redistribuible de Microsoft
> lo prohíbe): `scripts/build-controller-listen.ps1` lo baja del NuGet a `build/` (git-ignored) y el
> `.exe` enlaza el runtime dinámicamente. Verificado end-to-end con hardware real: Xbox por USB 8/8
> (GameInput, en segundo plano), DualSense 12/12 (HID), y el owner confirmó el guardado de clip en la
> app con ambos mandos.

## Fase 18 · Detección en vivo, Riot y visor del índice — ✅ entregado

- [x] **Re-índice reactivo**: un juego instalado con la app abierta se detecta solo, sin reiniciar ni
      re-escanear a mano. El sondeo de procesos (que ya corre cada 5 s) fija una **línea base** al
      arrancar y, si luego aparece un `.exe` que la app no reconoce, pide reconstruir el índice
      (evento `'unknown-executable'`), con set de vistos y **cooldown de 30 s**. Barato: reusa
      `refreshGameIndex` (la huella evita el escaneo de carpetas si nada cambió).
- [x] **Fuente Riot** (`riot`): lee el almacén unificado de Riot Client
      (`%ProgramData%\Riot Games\Metadata\<producto>\*.product_settings.yaml` → `product_install_full_path`
      + `shortcut_name`, con un regex por línea, sin dependencia de YAML). Cubre Valorant, LoL, LoR,
      2XKO… de una pasada; la **presencia del yaml** marca "instalado".
- [x] **Visor del índice**: el contador de Ajustes → Grabación pasa a contar **juegos** distintos (no
      ejecutables), y el detalle técnico (mapa `ejecutable → juego`) va a Ajustes → **Desarrollo** en un
      desplegable colapsado por defecto.
- [x] Publicado como **v0.8.1** (portable): https://github.com/leor45/gameclip/releases/tag/v0.8.1

> Release 0.8.1 (2026-07-15). Tres ramas: `fix/reindice-automatico-juegos`, `feature/fuente-riot` y
> `feature/deteccion-info-desarrollo`. El síntoma de partida —"no detecta los juegos de GOG/Ubisoft"—
> resultó **no ser un bug de las fuentes**: funcionaban, pero el índice solo se reconstruía al arrancar,
> así que un juego instalado con la app abierta no aparecía hasta reiniciar o re-escanear a mano. La
> pieza clave es que el re-índice se cuelga del **sondeo de procesos que ya existía** (no añade ningún
> bucle nuevo), como hace Discord. Verificado en vivo ocultando/restaurando las carpetas: Moonlighter
> (GOG) y Child of Light (Ubisoft) se detectan sin reiniciar. La fuente Riot, verificada E2E con 2XKO
> (`Lion.exe` → `2XKO`, que ni está en la lista curada ni se parece al nombre). El contador de
> "ejecutables" confundía (un juego mete varios `.exe`; Wallpaper Engine ~25), así que pasa a contar
> juegos. 756 tests verdes.

## Fase 19 · Overlay de rendimiento — ✅ entregado

- [x] Overlay configurable en Ajustes → Avanzado con nueve métricas por check (FPS · GPU uso/temp/
      fans/voltaje/VRAM · CPU uso/temp · RAM), posición al estilo NVIDIA App (8 presets con flechas +
      dos sliders sincronizados, nunca el centro exacto), disposición apaisada o desglosada, tamaño de
      fuente (pequeño · estándar · grande), color y opacidad, con **previa en vivo** mientras se ajusta.
- [x] Atajo global configurable (Alt+R por defecto) que solo alterna la visibilidad. Entra en el
      catálogo `HOTKEY_ACTIONS`, así que hereda gratis la detección de colisiones y la reserva de la
      tecla del push-to-talk de la Fase 14.
- [x] **Nunca tapa los avisos**: REC, clip guardado y aviso de juego comparten nivel `screen-saver` y
      se re-elevan por encima cada 2 s.
- [x] **No sale en las grabaciones** aunque esté a la vista: `setContentProtection(true)`
      (`WDA_EXCLUDEFROMCAPTURE`).
- [x] FPS **sin depender de la detección de juegos** (funciona con emuladores y cualquier app que
      presente), que **se mantienen en segundo plano** y que **cuentan los frames generados** por
      DLSS/FSR Frame Generation.
- [x] Auto-inicio elevado opt-in por tarea programada (`RunLevel=Highest`): PresentMon necesita
      administrador para abrir su sesión ETW.

> `feature/overlay-rendimiento` (2026-07-18). Dos helpers propios bundleados: `gc-perf-sensors`
> (C# net48 + LibreHardwareMonitorLib, compilado con el csc de Windows) para los sensores, y
> **PresentMon 2.5.1** (Intel, MIT) para los FPS. El portable creció solo **+0,45 MB** (98 415 667 →
> 98 890 734 bytes): los ~4,5 MB de helpers se quedan en medio mega tras la compresión LZMA.
>
> **Por qué la 2.5.1 y no la 1.10:** la 1.x **no contabiliza los frames generados**. Medido contra el
> overlay de Steam en RE Requiem con DLSS FG (`DLSS 128 | FPS 64`): la 1.10 daba ~19–61 fps y la 2.5.1,
> 133. Las columnas que se parsean (`Application`, `MsBetweenPresents`) están en ambas.
>
> **Hallazgo de sesiones ETW:** sobreviven al proceso que las creó, así que matar PresentMon deja la
> sesión viva. Con varias huérfanas —propias, o de Steam y la NVIDIA App, que capturan igual— Windows
> agota los cupos del proveedor y PresentMon arranca **sin error pero mudo**, sin ninguna pista del
> problema. Se limpian con `logman stop <nombre> -ets`; en la app lo mitiga un watchdog que reinicia si
> no llega ni una línea en 12 s, espaciando a un reintento por minuto en vez de rendirse (la causa
> suele resolverse sola al cerrarse el otro capturador).
>
> Dos bugs cazados en la E2E del owner comparando contra Steam: (1) el **enganche al proceso era
> permanente** —se elegía el más rápido en la primera evaluación y nunca se revisaba—, así que con
> GameClip arrancado antes que el juego se quedaba pegado a una app de escritorio: marcaba 52 fps,
> que era Discord, con el juego a 129. Ahora otro proceso le roba la lectura si lo supera por un 25 %.
> (2) el contador **parpadeaba a «—»**: las muestras se fechan al llegar por la tubería y PresentMon
> escribe por bloques cuando su salida no es una consola, así que llegan a ráfagas; con la ventana de
> la media (1 s) igual al periodo de muestreo (1 s) no había holgura y un bloque tardón la vaciaba.
> Ahora se sostiene la última lectura durante 2 s. 822 tests verdes.
>
> **Decisión sobre la VRAM:** nuestro número (memoria física de la tarjeta contada por el driver, vía
> NVAPI) no coincide con el de Steam (`Budget`/`CurrentUsage` de DXGI, que es lo que el SO *te permite
> usar* y se encoge cuando otra app pide memoria). Se conserva el nuestro a propósito: para un overlay
> de rendimiento la pregunta útil es cuánto está llena la tarjeta, contando todo lo que hay dentro.
>
> **⚠️ Sin publicar todavía.** Quedan dos trabajos acordados que van en el **mismo release** que esta
> fase: `feature/fps-solo-en-juego` (FPS en «—» en el escritorio) y
> `feature/overlay-proteccion-selectiva` (que el overlay sí salga en capturas externas). El overlay de
> rendimiento **no se publica hasta que las tres ramas estén en `main`**, y las notas del release se
> arman con las tres juntas.
>
> **`feature/fps-solo-en-juego` (2026-07-18, en `main` sin release):** el contador medía *cualquier*
> proceso que presentara, así que en el escritorio marcaba los FPS de Discord o del navegador. Ahora
> un proceso **califica** para el contador por dos vías, y basta una: presentar por la ruta directa a
> hardware (modos `Hardware…` de PresentMon, columna 7 del CSV — el dato ya llegaba y se tiraba), o
> **ser el juego detectado** por la app. Sin ninguno calificado → «—», y **el resto de métricas sigue
> vivo**. La pieza que hace que no rompa nada es *dónde* se aplica: calificar es requisito de
> **entrada al enganche**, no filtro por lectura, así que un juego conserva el contador aunque DWM
> degrade su modo (un menú, un overlay encima) o pase a segundo plano; filtrar lectura a lectura lo
> habría hecho parpadear. La columna se trata como **opcional**: si una versión futura de PresentMon
> la renombrara, exigirla mataría los FPS del todo — sin ella se degrada a «todo califica».
>
> **El hallazgo de la E2E, que contradice la premisa del plan:** medido con PresentMon en la máquina
> del owner, **ninguna aplicación llega a modo hardware — solo DWM**. Un juego AAA en pantalla
> completa (`re9demo.exe`) presenta 2127/2127 frames en `Composed: Flip`, igual que el emulador
> (`eden.exe`, 533/533) y que Discord o el editor. El *Independent Flip* casi no ocurre en Windows 11
> moderno (ventana sin bordes por defecto, HAGS, overlays topmost). O sea: **la vía del modo no
> dispara nunca en esta máquina y todo el trabajo lo hace la detección.** Se descartó que fuera culpa
> del overlay propio repitiendo la medición con él apagado. Aun así la vía del modo **se conserva
> porque es puramente aditiva** —solo puede encender FPS, nunca apagarlos—, y donde el *Independent
> Flip* sí ocurra cubre juegos no detectados. Limitación aceptada: un juego/emulador en ventana y no
> detectado muestra «—»; se resuelve con **alta manual**, que es lo que ya hay que hacer para
> clipearlo. Verificado E2E por el owner. 831 tests verdes (+14).
>
> ⚠️ **Al contar las fuentes de detección son TRES**: lista curada (`src/shared/games.ts`), altas
> manuales (`customGames`) e **índice de launchers** (`games-index.json`), que es la que más juegos
> aporta. Durante la E2E se dio una falsa alarma por revisar solo las dos primeras.
>
> ### ✅ Bloqueante del release resuelto: `fix/sensores-pawnio` (2026-07-18, en rama)
>
> **El overlay ya se puede publicar.** LibreHardwareMonitor sube 0.9.4 → **0.9.6**: fuera WinRing0,
> dentro PawnIO. Verificado sobre los binarios que enviamos (no sobre el changelog): la 0.9.4 contenía
> `WinRing0.gz`/`WinRing0x64.gz` y en la 0.9.6 no hay **ninguna** ocurrencia; el script lleva ahora la
> comprobación dentro, así que el build falla si vuelve a colarse.
>
> **El salto no era cambiar un número** — tres cosas que el spec resolvió midiendo, no presumiendo:
> (1) el paquete **ya no trae `lib/net472`**: ahora hay `ref/<tfm>/` para compilar y
> `runtimes/win-<arch>/lib/<tfm>/` con la implementación, así que la ruta que el script pedía fallaba;
> (2) las dependencias pasaron de **una a diez**; y (3) **sin binding redirects el `.exe` compila pero
> no arranca** (LHM referencia `System.Memory 4.0.5.0` y el paquete envía `4.0.2.0`) — MSBuild los
> genera solo y `csc` a pelo no, así que el `App.config` se mantiene a mano. `Program.cs` no necesitó
> ni un cambio. Compilado con `/platform:x64` (la implementación ya es específica de arquitectura).
>
> **La comprobación anti-WinRing0 se ganó el sueldo el primer día:** rechazó el build porque
> `RAMSPDToolkit-NDD.dll` contiene `WinRing0`/`IWinRing0Driver`. No es el driver embebido (solo una
> interfaz; ni `.sys` ni recurso `.gz`), pero se excluye junto a `DiskInfoToolkit`: sirven a grupos que
> el helper **nunca habilita** (solo `IsGpuEnabled`/`IsCpuEnabled`).
>
> **Empaquetado por carpeta con filtro**, no fichero a fichero: `extraResources` enumeraba a mano y el
> `.config` y las DLLs nuevas no habrían viajado. El fallo era invisible en dev —el helper resuelve
> `resources/` por `process.cwd()`— y en el portable no degrada una métrica: **mata el helper entero**.
>
> **Aviso de PawnIO ausente:** de las nueve métricas lo necesita **una**, Temp CPU (los MSR exigen
> anillo 0; lo de GPU va por NVAPI/ADL y CPU-uso/RAM ni pasan por el helper). El aviso sale **solo si
> esa métrica está marcada** —mismo criterio que `hotfix/aviso-metricas-admin`: la duda nace al marcar
> la métrica— y enlaza a `https://pawnio.eu`, en una constante única compartida (para un driver de
> kernel, que se cuele un mirror es un problema de seguridad). La detección mira si está **instalado**
> (`PawnIOLib.dll`), no si su servicio corre: un servicio parado sigue instalado. **Instalarlo desde la
> app queda fuera** —red, UAC y un binario de terceros dentro del portable son otra tarea—; por
> licencias no habría impedimento (PawnIO es GPL-2.0 con excepción de enlazado por IOCTL).
>
> ⛔ **Restricción de la máquina del owner, respetada y anotada:** su PawnIO es de **FanControl**, que
> gobierna los ventiladores del PC. **No se tocó el servicio** (verificado `Running` antes y después de
> cada prueba elevada); el caso "sin PawnIO" se simula con `GAMECLIP_PAWNIO_DIR` apuntando a una
> carpeta vacía, que además es **mejor prueba**: recorre la misma ruta de detección que un PC limpio.
>
> Verificado: `cpuTemp` **62,9 °C** elevado sobre el artefacto final y `null` sin elevar con los
> sensores de GPU intactos; el aviso visto en la app real por CDP con su enlace; y el helper
> arrancando **desde el portable empaquetado** (95 MB), sin `WinRing0` en nada del paquete. 846 tests
> verdes (+14). `resources/` pasa de 939 KB a 2,15 MB.
>
> <details><summary>Estado anterior (bloqueante abierto)</summary>
>
> ### ⛔ Bloqueante del release: `fix/sensores-pawnio` — **lo siguiente que se hace**
>
> **El overlay no se publica hasta resolver esto**, por delante incluso de
> `feature/overlay-proteccion-selectiva`. Motivo: `scripts/build-perf-sensors.ps1` fija
> **LibreHardwareMonitorLib 0.9.4** (nov-2024), que embebe el driver ring0 **WinRing0**. Desde
> **septiembre de 2025 Windows Defender lo marca** como `VulnerableDriver:WinNT/Winring0.G` y
> `HackTool:Win32/Winring0`, y pone en cuarentena a las apps que lo cargan. Este es justo el release
> que estrena las métricas de hardware: publicarlo con ese driver es pisar la mina a propósito, y
> para un portable que se descarga de GitHub, que Defender lo marque como *HackTool* es un problema
> de adopción, no una molestia.
>
> **La salida ya existe y es la que adoptó el ecosistema:** LibreHardwareMonitor cambió WinRing0 por
> **PawnIO** el 16-sep-2025 (PR #1857) y la **0.9.6 (feb-2026)** ya lo trae; FanControl hizo lo mismo
> en su v238 y con eso se le acabaron los reportes de antivirus. El trabajo es subir 0.9.4 → 0.9.6.
>
> **Dos matices que el spec tiene que resolver, no dar por hechos:**
> — PawnIO **sigue siendo un driver ring0** (bytecode sandboxeado): arregla el flag de Defender, **no**
> la fricción con anti-cheats. FanControl documenta que su v238 es incompatible con **FACEIT**. La
> recomendación para el usuario sigue siendo correr sin elevar si juega algo con anti-cheat de kernel.
> — PawnIO **se instala aparte** (instalador propio). Hay que decidir qué hace el portable si no está:
> degradar limpio (sin Temp CPU) es lo mínimo; pedir la instalación, lo deseable.
> — Verificar que la 0.9.6 conserva el target `net472` y que compila con el `csc` de C# 5 que usamos
> (la máquina no tiene SDK de .NET). Si no, cambia el enfoque del helper.
>
> **Decisión del owner sobre las notas del release (2026-07-18):** esto **NO va en las notas del
> release**, solo en los commits. El overlay de rendimiento **nunca se ha publicado**, así que ningún
> usuario recibió jamás una versión con WinRing0: no hay nada que comunicar ni de qué advertir. Es un
> arreglo interno previo al estreno, no un fallo corregido de cara al público.
>
> </details>
>
> **`hotfix/aviso-metricas-admin` (2026-07-18, en `main` sin release):** la leyenda de que FPS y
> Temp CPU necesitan administrador ya existía, pero al **final** del fieldset, colgada del checkbox
> «Iniciar con Windows como administrador» — y la duda nace **arriba**, al marcar la métrica en «Qué
> mostrar». Se añade el aviso ahí, remitiendo a la opción elevada; la leyenda del checkbox queda
> intacta (es donde toca explicar el mecanismo completo). La copy lo encuadra como una limitación de
> **dos** métricas y nunca como «la app requiere admin»: verificado sobre los manifiestos, tanto
> `GameClip.exe` como el portable y `gc-presentmon.exe` son `asInvoker`, **la app no pide UAC nunca**
> y 7 de las 9 métricas funcionan sin elevar. 832 tests verdes.
>
> ### 📦 Release 0.9.0 — el overlay de rendimiento sale con cinco tareas
>
> El overlay se publica **una sola vez**, cuando las cinco estén entregadas (decisión del owner,
> 2026-07-18). Ninguna se mergea a `main` sin su propio spec/plan aprobado.
>
> **Estado:** 1-4 ✅ mergeadas · 5 pendiente.
>
> 1. **`fix/sensores-pawnio`** — ✅ mergeado a `main` (2026-07-18). Quita WinRing0 (ver
>    arriba).
> 2. **`fix/sensores-cpu-solo-si-hace-falta`** — ✅ mergeado a `main` (2026-07-18). El helper pasa de
>    un modo a dos: `IsCpuEnabled` deja de ser incondicional y depende de una bandera **`--cpu`** que
>    el main pasa solo cuando «Temp CPU» está marcada. Sin ella, el grupo de CPU no se abre y **los
>    MSR no se tocan** — o sea, PawnIO no entra en juego para quien solo quiere FPS y uso de GPU.
>    Bandera **opt-in** a propósito: con opt-out, un despiste dejaría el grupo abierto, y el modo por
>    defecto tiene que ser el que **no** toca ring0 (que un fallo degrade a «no lee la temperatura» y
>    nunca a «carga un driver de kernel de más»). Cambiar de modo **relanza** el helper —seguro porque
>    `configure()` solo se llama al arrancar y en `settings:changed`, nunca por tick— **conservando la
>    última lectura**, para que tocar ese checkbox no haga parpadear a «—» las métricas de GPU (mismo
>    criterio que el arreglo del parpadeo de FPS de la Fase 19).
>
>    **Esto no apaga PawnIO: deja de usarlo.** GameClip nunca arranca ni para el servicio —no hay una
>    sola línea de gestión de servicios en el repo— y esta tarea no añade ninguna; lo que cambia es si
>    le hablamos. Queda prohibido en el spec, junto con cualquier lógica de «¿lo usa alguien más?»
>    para decidir apagarlo: es una carrera y no es asunto de una app de clips.
>
>    Verificado con **las dos variantes elevadas**, para que la diferencia sea la bandera y no los
>    permisos: sin `--cpu` → `cpuTemp: null` con las métricas de GPU intactas; con `--cpu` →
>    **48,125 °C**. Servicio PawnIO en `Running` antes y después. 854 tests verdes (+8).
>
>    *Causa raíz que arregla:* desmarcar «Temp CPU» dejaba de **pintar** el número sin cambiar nada por
>    debajo — el helper se lanzaba si había **cualquier** métrica de sensores marcada (`gpuUsage` lo
>    está por defecto), **sin argumentos**, y dentro ponía `IsCpuEnabled = true` incondicionalmente.
>    **Detectado por el owner** al revisar la entrega de `fix/sensores-pawnio`.
>
> 3. **`fix/copy-sin-nvidia-app`** — ✅ mergeado a `main` (2026-07-18). La NVIDIA App fue **referencia
>    de desarrollo** del overlay y el producto no debe nombrarla (instrucción del owner). El barrido
>    confirmó que la leyenda de posición era la **única** cadena que veía el usuario; se reescribe
>    entera en vez de recortar el paréntesis, para **conservar el dato útil** —por qué el centro no es
>    elegible—, que si desaparece hace parecer la reserva arbitraria y acabaría "arreglándose":
>    *«Con el overlay activo, los cambios se ven en pantalla al instante. El centro de la pantalla no
>    es una posición elegible: se deja libre para el juego.»*
>
>    **Decisión del owner sobre el resto:** se quedan los **comentarios de código** (`perf.ts`,
>    `Avanzado.tsx`), que son la nota de desarrollo que la referencia debía ser y documentan el porqué;
>    el **diagnóstico de PresentMon**, que cita a la NVIDIA App junto al overlay de Steam como
>    capturadores que **compiten por las sesiones ETW** (troubleshooting, no comparación de diseño); y
>    los nombres de encoder `NVIDIA NVENC…`, que son el nombre real del hardware.
>
>    El test va sobre el **DOM renderizado** y no sobre los ficheros: un `grep` en el repo daría rojo
>    por lo que se conserva a propósito y acabaría desactivado. La regla que se blinda es «el usuario
>    no la ve». 856 tests verdes (+2).
>
> 4. **`fix/helpers-no-reintentan-tras-morir`** — ✅ mergeado a `main` (2026-07-18). *Era el candidato
>    `fix/presentmon-no-reintenta-tras-morir`; el owner decidió meterlo en la 0.9.0 porque el overlay
>    aún no se ha publicado y se puede corregir antes de estrenarlo.*
>
>    Si un helper moría por su cuenta, sus métricas quedaban **muertas en silencio el resto de la
>    sesión**: `onExit` ponía `failed = true` y `start()` salía antes de nada. **El alcance resultó
>    mayor que el anotado**, que hablaba solo de PresentMon: `SensorsReader` tenía el patrón idéntico y
>    ahí el daño es peor — PresentMon solo mata los FPS, el de sensores se lleva **siete métricas**.
>
>    No se inventó mecanismo: el watchdog ya resolvía el caso hermano («vivo pero mudo») con
>    reintentos escalonados y **sin timers**, movido desde `fps()`. La muerte se trata igual — el flag
>    terminal pasa a ser **un estado con hora** y el siguiente tick relanza cuando toca. `failed` se
>    conserva **solo** para «falta el binario», que es lo único que no se arregla esperando. Sin
>    `setInterval` a propósito: otro ciclo de vida que apagar en `stop()` y en el cierre es justo lo
>    que provocó el bug de la bandeja destruida. La lectura **sí** se limpia al morir (la ventana dura
>    hasta un minuto y enseñar cifras viejas como actuales es peor que un guion) — al revés que el
>    relanzado por cambio de modo, donde el hueco es de ~1 s.
>
>    **Verificado E2E en la app real**, no solo en tests: matado el helper de sensores volvió solo a
>    los ~5 s; matándolo seis veces seguidas los huecos escalan y **se asientan en exactamente 60 s**;
>    y leyendo el overlay por CDP, GPU/Temp GPU/VRAM pasan de cifras → **«—»** → cifras otra vez **sin
>    tocar ajustes ni reiniciar**. 862 tests verdes (+8).
>
>    ⚠️ **Anotado de la E2E:** sin elevar, PresentMon muere al instante (no puede crear su sesión ETW)
>    y queda reintentando **una vez por minuto** mientras el overlay esté encendido — antes era un
>    intento y silencio. No se mitiga: el coste medido es despreciable y es la **misma política** que
>    el watchdog ya aplicaba al caso mudo. Si algún día molesta, lo natural es alargar la cadencia
>    cuando el proceso ni sobrevive un par de segundos (causa estructural, no pasajera).
>
> 5. **`feature/overlay-proteccion-selectiva`** — ✅ entregado (2026-07-18, en rama). Faltaba en esta
>    lista aunque su propio spec ya decía que entra en el mismo release que el overlay.
>
>    Hoy el overlay se crea con `setContentProtection(true)` (`WDA_EXCLUDEFROMCAPTURE`), que lo hace
>    invisible para **toda** captura: cumple lo de no salir en los clips, pero se pasa de largo y
>    tampoco se ve al compartir pantalla en Discord ni en un recorte de Windows, que es justo donde el
>    usuario sí lo quiere. La idea es aplicar la protección **solo cuando el pipeline está capturando
>    el monitor** (perfil `desktop` capturando de verdad); con perfil `game` queda siempre quitada,
>    porque el `game_capture` solo ve la swapchain del juego y los clips salen limpios igual.
>
>    La decisión vive en `needsContentProtection(profile, capturing)` (pura, en `@shared/capture`), el
>    `CaptureManager` la recalcula en cada transición y la emite **solo al cambiar**, e `index.ts` la
>    puentea al controlador del overlay — sin acoplar manager y overlay, igual que con
>    `settings:changed`. Orden seguro: **proteger antes** de arrancar la salida y **desproteger
>    después** de pararla, para no dejar frames con el overlay dentro del búfer. La ventana **nace
>    protegida**: si el cable se rompiera, el fallo sería «no se ve en una captura externa» —lo de
>    siempre— y nunca «se coló en un clip».
>
>    **El riesgo principal del plan estaba sin verificar y se midió:** conmutar `setContentProtection`
>    sobre una `BrowserWindow` real (ida, vuelta y 10 veces seguidas) **no** altera topmost,
>    visibilidad ni geometría. La mitigación (reaplicar `setAlwaysOnTop`) **se conserva igualmente**,
>    porque `isAlwaysOnTop()` devuelve la bandera de Electron y no el nivel Win32: la sonda no puede
>    descartar que el nivel `screen-saver` se pierda.
>
>    **Verificado E2E con captura GDI** —la misma vía que un recorte de Windows o el compartir pantalla
>    de Discord—: escritorio con búfer → overlay **ausente**; juego detectado → overlay **visible**
>    («FPS — GPU 18 % Temp G…»); juego cerrado → **ausente** otra vez. Y sobre un **clip real** de
>    escritorio, el fotograma no contiene el overlay: desproteger no lo filtra a los clips.
>    872 tests verdes (+8).
>
>    ✅ **E2E del owner con juego real (2026-07-18): «funcionando, no sale en las capturas de vídeo».**
>    El argumento en el que se apoya la feature —el `game_capture` no ve una ventana ajena— queda
>    confirmado con un juego de verdad.
>
>    🐞 **Efecto secundario detectado en esa E2E, aceptado y aplazado por el owner:** las **capturas de
>    pantalla de la app** (hotkey de screenshot, PNG en `Capturas/`) **sí incluyen el overlay** cuando
>    está desprotegido. Es una **regresión de esta feature**, no una rareza previa: antes el overlay
>    estaba protegido siempre y no salía en ninguna. La captura de pantalla toma el monitor, así que
>    con perfil `game` —donde ahora se desprotege a propósito— la ventana entra. Arreglarlo es
>    proteger alrededor del disparo de la screenshot (protegerla justo antes y devolverla después),
>    y va en su propia rama: **no bloquea la 0.9.0** por decisión del owner.
>
> **✅ Las cinco entregadas y publicadas como v0.9.0 (2026-07-18, portable).** El overlay de
> rendimiento sale por fin, con FPS que solo cuentan juegos y visible en capturas externas.
>
> **Notas del release:** solo la funcionalidad final y los **requisitos que el usuario necesita
> entender** (FPS → administrador; Temp CPU → administrador **y** PawnIO, con enlace). Los cuatro
> fixes internos **no** aparecen, por decisión del owner: se corrigieron antes de publicar, así que
> ningún usuario los sufrió. Se documenta además que **Voltaje de GPU no muestra valor** y está en
> revisión.

## Verificación pendiente (no es un bug: es que no se pudo probar)

### 🔍 Detección de juegos de EA, Battle.net y Xbox

Las fuentes del índice para esos tres launchers (`src/main/games/sources/`) están **escritas y
probadas con fixtures, pero nunca ejecutadas contra un juego real**: en la máquina del owner están
instalados y **vacíos** (ni un juego), así que no hubo con qué comprobarlas.

**Ya verificados de extremo a extremo:** Steam, Epic, **GOG** (Moonlighter), **Ubisoft** (Child of
Light) y **Riot** (2XKO) — estos tres últimos en la 0.8.1. Quedan EA App, Battle.net y Xbox/Game Pass.

**Qué hay que hacer:** instalar **un** juego en cada launcher y comprobar que (a) aparece en el índice
con su nombre de catálogo, (b) se detecta al abrirlo, y (c) no mete falsos positivos (el caso
`EpicWebHelper.exe` de Fortnite: helpers del launcher que corren aunque el juego esté cerrado). Basta
con arrancar la app y mirar el log `[games]`, el contador de **juegos reconocidos** en Ajustes →
Grabación, o el desplegable del índice en Ajustes → Desarrollo.

**Riesgo si fallan:** acotado por diseño. Cada fuente está aislada y devuelve `[]` ante cualquier
error, así que un formato inesperado deja el índice sin esos juegos —se siguen pudiendo añadir a
mano— pero no rompe la detección de Steam/Epic ni la app.

### 🐞 Las fuentes de vídeo se acumulan en cada rebuild — ✅ arreglado (`fix/fuga-fuentes-video-en-rebuild`, 2026-07-18)

Cada reconstrucción del pipeline dejaba viva la fuente de vídeo de la anterior. libobs las renumeraba
al chocar los nombres, así que una sesión acumulaba `gameclip-monitor 2`, `3`, `4`… y
`gameclip-game 2`, `3`… Al cerrar: `9 source(s) were remaining` + timeout. Visto en dos máquinas
distintas (AMD + x264 y NVIDIA + nvenc), así que no era del entorno.

Dos referencias colgadas, ambas por no cerrar el ciclo de vida de lo que vive **en la escena**:

1. **Las fuentes.** `scene.add(input)` devuelve un scene item con su propia referencia; el item solo
   se usaba para `applyBounds` y se descartaba. `input.release()` soltaba la nuestra, no la del item,
   así que el `obs_source_t` nunca llegaba a refcount 0.
2. **La escena misma.** El getter `scene.source` entrega un wrapper con su propia referencia; se
   colgaba del canal 1 sin guardarlo, y nadie lo soltaba. Por eso `gameclip-scene` seguía renumerando
   incluso tras arreglar (1).

El audio nunca sufrió el problema: no pasa por la escena, va a canales de salida globales que el
teardown ya anulaba uno a uno.

Arreglo: guardar `sceneItems` y `sceneSource`, y en el teardown eliminar los items y soltar el
wrapper **antes** de `scene.release()` — después ya no hay a quién pedirle que quite el item.
Verificado en máquina real con juego falso (`cs2.exe`) para forzar transiciones de perfil: 12
reconstrucciones con **0 nombres duplicados** (antes: 6 rebuilds → 6 duplicados), cierre sin fuentes
pendientes, clip con imagen (0 frames negros, YAVG ≈ 95) y audio sano medido con un tono de 440 Hz
(pista `pc` −28.7 dB, `mic` −91 dB correcto).

### ✅ v0.9.1 (2026-07-19, portable) — dos fixes de captura

1. **La escena y sus fuentes se destruyen de verdad** (arriba): se acabó la acumulación en cada
   reconstrucción del pipeline.
2. **Re-apuntado a la ventana del juego.** El pipeline se construye cuando el detector ve el
   **proceso**, pero la **ventana** puede aparecer después (12 s en Helldivers 2). Apuntando una
   sola vez, el game capture se quedaba en `any_fullscreen` toda la sesión. Bucle acotado de 5 s ×
   24 intentos: para en cuanto apunta y agotado el tope deja el comportamiento previo.

> ⚠️ **Lo que la 0.9.1 NO arregla:** los clips negros de **Helldivers 2** en las builds publicadas.
> Su causa raíz es que `obs64.exe` no lleva firma Authenticode y el anti-cheat le deniega el acceso
> al proceso del juego (entrada propia más abajo). Las notas del release no deben prometerlo.

## Bugs abiertos (pendientes de su propia rama `fix/`)

### 🔑 Los juegos con anti-cheat exigen que `obs64.exe` esté FIRMADO (Helldivers 2)

**Síntoma:** con HD2 detectado, el clip sale **negro y sin audio del juego**. Reportado por un
usuario en la 0.8.1 y reproducido en la máquina del owner.

**Causa raíz (medida el 2026-07-19, tras descartar tres hipótesis):** nProtect GameGuard **deniega
el acceso al proceso del juego a los binarios sin firma Authenticode**. El `obs64.exe` que
distribuye `@streamlabs/obs-studio-node` —el proceso donde corre libobs y desde donde se hacen las
llamadas— **va sin firmar**, y es el único eslabón sin firma de toda la cadena:

| Binario | Firma |
|---|---|
| `Medal.exe` | Valid — `CN=Medal B.V.` |
| `obs64.exe` de OBS Studio | Valid — `CN=OBS Project, LLC` |
| **`obs64.exe` de obs-studio-node** | **NotSigned** |
| `graphics-hook64.dll` (el nuestro) | Valid — OBS Project |
| `inject-helper64.exe` (el nuestro) | Valid — OBS Project |

Sin firma, `get_window_exe` no puede resolver el proceso dueño de la ventana y libobs lista
`HELLDIVERS™ 2:stingray_window:unknown`; `GetWindowThreadProcessId` devuelve 0; y `OpenProcess` con
derechos de inyección da `ERROR_ACCESS_DENIED`. De ahí los 82 `error acquiring, failed to get window
thread/process ids` y el lienzo negro.

**Verificado por contraste**, misma máquina y misma noche:

| Escenario | Lista de libobs | Hook |
|---|---|---|
| `obs64.exe` sin firmar | `…:stingray_window:unknown` | `0x0` durante 3 min |
| **`obs64.exe` firmado** (certificado de prueba) | `…:stingray_window:helldivers2.exe` | `2560x1440`, `d3d12 shared texture capture successful` |
| OBS Studio (firmado por OBS Project) | `…:helldivers2.exe` | captura sin problema |

Con la firma puesta, el clip salió con imagen (0 frames negros, YAVG 62.5) **y con la pista de audio
del juego a −28.1 dB**, con las pistas separadas intactas.

**Hipótesis descartadas por el camino** (anotadas para no repetirlas):

- *«El matcher busca por el campo que el anti-cheat oculta.»* Se implementó emparejado por título
  normalizado; resolvía la ventana y el hook fallaba igual. Retirado.
- *«HD2 es Vulkan y hay que registrar una capa como hace Medal.»* HD2 es **D3D12**
  (`d3d12_init` en el log). La carpeta Vulkan de Medal despistó.
- *«Nuestro backend lleva vivo desde antes que el juego y por eso lo bloquean.»* Un `obs64.exe`
  recién lanzado y muy posterior al juego enumera `unknown` igual.
- *«Es cuestión de privilegios.»* Elevar a administrador no cambia **nada**, ni en PowerShell ni en
  la app. Era el dato que no encajaba con ninguna teoría hasta que apareció la firma.
- *«WGC (`window_capture`) esquivaría el bloqueo.»* Se congelaría al minimizar el juego, donde Medal
  sigue capturando — HD2 sigue renderizando minimizado. Descartado por el owner con esa prueba.

**Nota sobre Medal:** su captura es **libobs renombrado**. Su manifiesto de capa Vulkan conserva la
función `OBS_Negotiate` y la variable `DISABLE_VULKAN_MEDAL_OBS_CAPTURE`. No usan otra tecnología:
usan la misma, firmada.

**Estado:** el arreglo **no es código**. Opciones, por orden de coste:

1. **Pedir a Streamlabs que firme su `obs64.exe`** (`obs-studio-node` es open source). Gratis y
   arreglaría el problema para todos los que usan la librería.
2. **SignPath Foundation**: firma de código gratuita para proyectos open source. GameClip cumple los
   requisitos aparentes (repo público, GPL-3.0, releases publicadas).
3. **Certificado propio**: OV desde ~$219/año, y desde el 2026-02-23 con token hardware o HSM
   obligatorio también para OV. Azure Artifact Signing sale a $9.99/mes pero para individuales solo
   está disponible en EE.UU. y Canadá.
4. **Autofirmado** para un círculo cerrado: funciona (así se verificó), pero exige que cada usuario
   instale la raíz de confianza, con lo que eso implica. No debe publicarse en el repo.

**Lección de método:** esta entrada tuvo **tres causas raíz distintas escritas como definitivas**
antes de la correcta. Todas eran deducciones desde señales indirectas —la lista de ventanas, un
overlay en un frame, la resolución de un clip— y las tres las tumbó el owner con datos. Lo que
funcionó fue medir directamente: comparar la firma de los binarios. Cuando una explicación deje un
dato sin encajar (aquí: que elevar a admin no cambiara nada), ese dato es la pista, no el ruido.

### 🐞 El perfil de juego se decide por proceso, no por ventana (menú de LoL)

**Síntoma:** con el cliente de LoL abierto (menú, aún sin partida) el clip sale negro. En partida
real funciona.

**Causa raíz:** el detector es puramente por nombre de proceso (`tasklist` cada 5 s,
`game-detector.ts`). `leagueclient.exe` arranca **antes** que su ventana, así que `resolveGameWindow()`
no encuentra nada, se cae a `any_fullscreen` y **no se re-resuelve nunca**. Con el juego en ventana,
`any_fullscreen` no lo engancha — y llega a agarrar cualquier **otra** cosa a pantalla completa: en
el log del usuario intentó enganchar `brave.exe` unas 90 veces en 13 minutos. Ninguno prosperó, pero
con una app menos protegida habría grabado el navegador (fuga de privacidad, no solo clip feo).

Riesgo ya anticipado en `spec/work/fix-game-capture-negro/plan.md`; ahora confirmado en producción.
Afecta a **todo juego con launcher** (LoL, Valorant, arranques en dos fases de Steam).

**Dirección del arreglo:** que el perfil `game` entre cuando aparece una **ventana enganchable** del
ejecutable, no cuando aparece el proceso. Efecto secundario deseable: el aviso de clipear dejaría de
saltar durante el anti-cheat.

### 🐞 Nadie comprueba que la fuente de vídeo dé píxeles

**Síntoma:** los dos bugs de arriba (y cualquier hook fallido) terminan en un clip negro **guardado
en silencio**. La app no mira en ningún momento si la escena está produciendo imagen: los
`signalHandler` solo escuchan `start`/`stop`/`wrote` de las *salidas*.

Un `game_capture` sin hook reporta `0×0` (medido con la sonda en el instante exacto en que se guardó
un clip negro), así que la señal existe y es barata de leer.

**Dirección del arreglo:** detectar `0×0` pasado un margen y caer a `monitor_capture`, avisando en la
UI. **Ojo con el alcance:** `effectiveCapture` hoy ata el modo de audio al perfil de vídeo
(`audioMode: 'desktop'` forzado fuera del perfil `game`); un fallback que arrastre eso degradaría el
audio por app a «todo el PC junto» sin necesidad. Los dos ejes deben desacoplarse.

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

> ⚠️ **NO está obsoleto: es intermitente (2026-07-19).** El 2026-07-18 se anotó aquí que
> «posiblemente ya estaba arreglado» porque tres selftests seguidos dieron un MP4 válido. Esa
> lectura era **errónea**, y conviene no repetirla: el bug volvió a aparecer tal cual durante la
> verificación de `fix/game-capture-ventana-sin-ejecutable` (`Total frames output: 1` frente a
> `Total drawn frames: 262`, clip de 261 bytes).
>
> **Frecuencia medida ese día:** 2 fallos en ~10 ejecuciones, y con **severidad variable**: una vez
> `Total frames output: 1` (MP4 de 261 bytes) y otra `13` de ~240 esperados (MP4 de 0.2 MB con
> imagen, pero entrecortado). O sea que no es «graba o no graba»: la salida de grabación se queda
> sin frames en distinta medida cada vez. En las mismas ejecuciones el `replay-buffer` sacó sus
> ~285 frames sin despeinarse, lo que refuerza que el problema es del encoder compartido entre las
> dos salidas y no del pipeline. No se encontró disparador: la detección del
> juego a mitad de la grabación ocurrió en **todas** las ejecuciones, incluidas las 7 correctas, así
> que no es eso. El aviso `Cannot apply a new video_t object while the encoder is active` también
> sale en las ejecuciones que funcionan, o sea que por sí solo no distingue.
>
> **Consecuencia para quien lo coja:** un puñado de ejecuciones verdes **no** demuestra nada aquí.
> Hace falta una tanda larga y contar la tasa, no repetir hasta que salga bien.

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
