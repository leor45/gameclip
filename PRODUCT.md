# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

> App de escritorio Electron (Windows) cuyo UI es web (React). El lenguaje de diseño es propio, no nativo de Windows.

## Users

El owner (Leo) y su círculo cercano de amigos que juegan en PC con Windows. Usan GameClip **mientras juegan**: la app vive en la bandeja, captura en segundo plano y se abre después para revisar, recortar y compartir clips. Distribución por GitHub Releases, pero el público objetivo es ese círculo, no el mercado general.

## Product Purpose

Grabar clips de partidas (replay retroactivo con atajo, grabación de sesión completa o manual) y del escritorio, organizarlos en una biblioteca local por juego, y editarlos (recortes, cortes múltiples, volumen por pista, reencuadre) para exportarlos. Éxito: el clip de la jugada está guardado sin haber pensado en ello, y sacarlo listo para compartir lleva segundos.

## Positioning

Frente a Medal, Outplayed o la NVIDIA App:

- **Todo local, sin nube:** los clips no salen del PC.
- **Ligero mientras juegas:** corre de fondo sin robar rendimiento al juego.
- **Audio por pistas y editor:** juego, micrófono y apps en pistas separadas que se mezclan después.
- **Captura con anti-cheat:** binarios firmados que capturan juegos que bloquean a grabadores sin firma (p. ej. Helldivers 2).

## Operating Context

- La ventana principal se usa entre partidas; durante la partida el contacto es por atajos globales, el botón de captura del mando, la bandeja y el overlay in-game (avisos, REC, overlay de rendimiento).
- Detección automática de juegos instalados (Steam, Epic, GOG, Riot, Xbox, registro) y juegos manuales; lista «no son juegos».
- Vistas: Biblioteca (grilla con preview al pasar el ratón, favoritos, filtros por juego), Editor simple, Editor avanzado (timeline, pistas, reencuadre, borradores), Ajustes (Grabación, General, Calidad, Audio, Atajos, Almacenamiento, Avanzado, Desarrollo), Login/Registro.

## Capabilities and Constraints

- Electron + React + TypeScript; captura con obs-studio-node (libobs). Windows es la única plataforma.
- `contextIsolation` activo; todo pasa por IPC/preload. Medios por el protocolo `gameclip-media://`.
- La app corre mientras se juega: el UI no puede costar GPU/CPU de forma notable (nada de animaciones pesadas permanentes ni decodificar vídeos que no se ven).
- Overlay in-game: ventanas transparentes siempre encima, no se ven en fullscreen exclusivo.

## Brand Commitments

- **Nombre:** GameClip.
- **Logo:** `build/icon.svg` — mando oscuro recortado sobre baldosa amarilla `#f5c518` (fuente de `icon.ico`/`icon.png`).
- **Idioma:** toda la interfaz en español.
- **Cuentas:** la pantalla de inicio de sesión y registro se conserva.

## Evidence on Hand

- Clips reales del owner en `C:\Users\Leo\OneDrive\Vídeos\GameClip` (no se versionan).
- No hay testimonios, métricas públicas ni capturas de marketing; no inventarlos.

## Product Principles

1. **Invisible mientras juegas:** capturar nunca debe interrumpir ni pesar.
2. **Tus clips son tuyos:** local primero, sin dependencia de servicios externos.
3. **Del momento al clip compartible en segundos:** biblioteca y editor optimizan el camino corto.
4. **Control sin ceremonia:** ajustes potentes (pistas, encoders, monitores) con valores por defecto que funcionan.
