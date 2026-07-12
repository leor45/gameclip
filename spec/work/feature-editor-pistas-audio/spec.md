# Spec — Editor: pistas de audio por nombre (exportar y guardar edit)

**Tipo:** Feature
**Rama:** `feature/editor-pistas-audio`
**Fecha:** 2026-07-11

## Problema / Objetivo

Desde `feature/pistas-audio-por-rol` los clips grabados en modo apps llevan pistas nombradas
(`default`, `game`, `mic`, `<app>`), pero **nada en la app las usa**: el editor no las muestra y
la exportación deja que ffmpeg elija la pista de audio por su cuenta. El pendiente de la Fase 5
("resto de herramientas del editor") pide cerrar ese círculo: que el usuario vea las pistas por
nombre, marque cuáles quiere y decida qué hacer con esa selección.

Dos acciones distintas sobre la misma selección:

1. **Exportar** — genera un archivo nuevo (recorte + formato + calidad, como hoy) cuyo audio es
   **solo la mezcla de las pistas marcadas**. No toca el clip guardado.
2. **Guardar edit** — modifica **el clip que está en la carpeta de clips**: la mezcla general
   (pista 1, `default`) pasa a contener solo las pistas marcadas. Las pistas desmarcadas
   **siguen en el archivo** (no se borran), así que el edit es reversible: volver a marcarlas y
   guardar reconstruye la mezcla. No recorta ni recodifica el video.

## Alcance

**Dentro:**

- Lectura de las pistas de audio de un clip (índice + nombre) en el main, sondeando el MP4.
- Editor: lista de pistas por nombre con checkbox (marcadas por defecto), al estilo de la lista
  de audio de Ajustes. La pista 1 (`default`) no se lista: es la mezcla derivada, no una fuente.
- Exportar MP4 con el audio = mezcla de las pistas marcadas (una sola pista de audio en la
  salida). Sin pistas marcadas → export sin audio.
- Botón **Guardar edit**: reescribe el clip original con `default` = mezcla de las marcadas,
  copiando el video y las demás pistas sin recodificar (`-c copy`), con rename atómico.
- Persistencia de la selección en el catálogo (columna nueva en `clips`), para que el editor
  reabra el clip con los mismos checkboxes.
- Tests unitarios: parseo del sondeo, construcción de args de ffmpeg (export y guardar edit),
  normalización del request por IPC, repositorio y editor (RTL).

**Fuera (explícito):**

- **Previsualización del mute en el reproductor**: Chromium reproduce solo la primera pista de
  audio del MP4 y no expone `video.audioTracks`, así que el `<video>` del editor sigue oyendo
  la mezcla actual. Tras **Guardar edit** la mezcla ya es la nueva y la previa sí la refleja.
- Clips **sin pistas por rol** (modo escritorio, clips viejos, grabaciones de una sola pista):
  se listan como una única pista "Audio" que se puede desmarcar para exportar sin audio, pero
  **Guardar edit queda deshabilitado** — sin pistas aisladas no hay con qué reconstruir la
  mezcla.
- Volumen por pista en el editor (solo mute/unmute), reordenar pistas, añadir audio externo.
- Que "Guardar edit" aplique también el recorte al clip guardado (el recorte sigue siendo cosa
  de exportar).
- GIF: no tiene audio; con formato GIF la sección de pistas se oculta.

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] Al abrir en el editor un clip grabado en modo apps con pistas separadas, se ve una fila
      por pista con su nombre (`game`, `mic`, `opera`, …), todas marcadas.
- [ ] Desmarcar `mic` y exportar a MP4 produce un archivo con **una** pista de audio que
      contiene el resto (verificable: sin la señal del mic) y con la duración del recorte.
- [ ] Exportar sin ninguna pista marcada produce un MP4 sin pista de audio.
- [ ] **Guardar edit** con `mic` desmarcado deja el clip original en su carpeta con el mismo
      número de pistas y nombres, pero su pista 1 (`default`) ya no lleva el mic; el
      reproductor de la app (que oye la pista 1) suena sin mic.
- [ ] Volver a marcar `mic` y guardar edit otra vez restaura la mezcla completa (la pista `mic`
      nunca se borró).
- [ ] Reabrir el editor del clip muestra los checkboxes tal como se guardaron.
- [ ] Un clip sin pistas por rol muestra una sola fila "Audio" y el botón Guardar edit
      deshabilitado con una explicación.
- [ ] Gates verdes: `npm run typecheck`, `npm run lint`, `npm run test`.
