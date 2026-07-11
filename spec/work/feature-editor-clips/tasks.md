# Tasks — Editor de clips (Fase 5)

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. Dependencia `ffmpeg-static` + tipos compartidos `src/shared/export.ts`.
- [x] 2. `ffmpeg-args.ts` (función pura) con tests.
- [x] 3. `ExportManager` (spawn inyectable, progreso, cancelación, borrado de parciales)
        con tests.
- [x] 4. IPC + preload (`window.gameclip.exporter`, `library.get`) y wiring en main
        (save dialog, portapapeles, mostrar en carpeta).
- [x] 5. Vista Editor (carga por ruta, sliders de recorte, previsualización, exportación
        con progreso/cancelar, acciones post-export) + botón Editar en ClipCard + estilos.

## Tests unitarios (obligatorios)

- [x] Args de ffmpeg: MP4 y GIF por preset, recorte aplicado, rutas intactas.
- [x] Validación de request de export (inicio < fin, formatos/calidades válidos).
- [x] ExportManager: progreso parseado de `out_time_ms`, resolución en `done`,
      `canceled` mata y limpia parcial, `error` con salida ≠ 0, rechaza concurrencia.
- [x] Editor: carga el clip de la ruta, sliders limitan inicio<fin, exportar llama a la
      API con el recorte, progreso visible, estado terminado ofrece copiar/mostrar.
- [x] ClipCard: botón Editar navega a `#/editor/<id>`.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 110 tests
- [x] Comprobación manual: recorte real 0.5–3.0 s del replay de la Fase 3 →
      MP4 2.50 s (H.264+AAC) y GIF 2.54 s (480px/15fps) con el ExportManager real;
      `Set-Clipboard` deja el archivo pegable (FileDropList verificado).

## Cierre

- [x] Aprobación del owner (delegada para esta sesión)
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado (Fase 5 entregada)
