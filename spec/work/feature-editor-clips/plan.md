# Plan — Editor de clips (Fase 5)

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

La transcodificación vive en el **main** (spawn de ffmpeg de `ffmpeg-static`); el renderer
solo manda parámetros de recorte y recibe progreso por evento. Piezas:

1. **`src/main/export/ffmpeg-args.ts`** — función pura que arma los argumentos de ffmpeg a
   partir de `{entrada, salida, inicio, fin, formato, calidad}`. MP4: `-ss` antes de `-i`
   (seek rápido y exacto al reencodear) + `-t`, libx264 con CRF por preset (18/23/28,
   `veryfast`) + AAC. GIF: `fps` y `scale` por preset con `palettegen/paletteuse` en un solo
   paso. `-progress pipe:1 -y`. Testeable sin ffmpeg.
2. **`src/main/export/manager.ts`** — `ExportManager`: una exportación a la vez; spawn
   inyectable (tests con proceso falso), parsea `out_time_ms` del stdout para progreso
   (0–1), emite `progress`, resuelve `{status: done|canceled|error}`; `cancel()` mata el
   proceso y borra el archivo parcial.
3. **IPC**: `export:run` (elige destino con `dialog.showSaveDialog` en el main y corre; la
   respuesta llega al terminar), `export:cancel`, `export:copy-last` (portapapeles como
   archivo vía PowerShell `Set-Clipboard -LiteralPath`, el único camino sin nativas en
   Windows), `export:show-last` (`shell.showItemInFolder`), evento `export:progress`.
   También `library:get` para cargar un clip por id en el Editor.
4. **UI** (`src/renderer/views/Editor.tsx`): ruta `/editor/:clipId?` — sin id, invita a
   elegir clip en la Biblioteca; con id, reproductor (`gameclip-media://clip/<id>`), dos
   sliders de inicio/fin con tiempos visibles, "Previsualizar recorte" (reproduce el
   segmento y pausa al final), formato + calidad, "Exportar" con barra de progreso y
   "Cancelar", y al terminar "Copiar al portapapeles" / "Mostrar en carpeta". La tarjeta de
   la Biblioteca gana el botón "Editar" (navega con `location.hash`, sin acoplar el
   componente al router).

## Archivos / módulos afectados

- `package.json` — dependencia `ffmpeg-static`.
- `src/main/export/{ffmpeg-args,manager}.ts` (+ tests de ambos).
- `src/shared/export.ts` — tipos `ExportFormat`, `ExportQuality`, `ExportRequest`,
  `ExportResult`, validación pura (+ tests).
- `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc.ts`, `src/main/index.ts` —
  canales nuevos y wiring (`window.gameclip.exporter`).
- `src/renderer/views/Editor.tsx` (+ tests), `src/renderer/components/ClipCard.tsx`
  (botón Editar), `src/renderer/styles.css`, `src/renderer/__tests__/setup.ts` (mock).

## Decisiones y alternativas consideradas

- **ffmpeg (`ffmpeg-static`)** — alternativas: WebCodecs en el renderer (sin soporte GIF ni
  mux AAC maduro, mucho código) o pedir ffmpeg instalado (fricción). El binario empaquetado
  es el estándar de facto.
- **Reencode siempre (no `-c copy`)** — copy solo corta en keyframes (recorte impreciso,
  segundos de error). CRF por preset da tamaño/calidad predecibles.
- **Portapapeles vía PowerShell `Set-Clipboard`** — Electron no expone CF_HDROP para
  archivos; el shell-out es fiable en Windows 10/11 (la plataforma objetivo).
- **Una exportación a la vez** — simplifica progreso/cancelación; suficiente para el caso
  de uso.

## Riesgos

- **Duración de GIF grandes** (palette + lanczos es CPU-bound): mitigado con presets que
  limitan fps/ancho y con cancelación.
- **`-ss` antes de `-i`**: exacto al reencodear en ffmpeg moderno; se verifica manualmente
  con un recorte real.
- **Clips OneDrive** (la carpeta Videos del usuario está en OneDrive): si el archivo está
  solo en la nube, ffmpeg falla al leer — el error se muestra tal cual en la UI.

---

**Estado:** ✅ aprobado el 2026-07-11 (aprobación delegada por el owner para esta sesión)
