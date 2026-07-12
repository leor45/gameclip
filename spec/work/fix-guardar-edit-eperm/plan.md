# Plan — Fix: "Guardar edit" falla con EPERM al reemplazar el clip

## Enfoque

Dos capas, y las dos hacen falta.

**El editor suelta el archivo.** El handle que bloquea el rename es el del propio reproductor:
`gameclip-media://` sirve el clip con `stream: true`, así que mientras el `<video>` lo tenga cargado,
la app misma lo mantiene abierto. Antes de pedir el guardado, el editor pausa el video, le quita el
`src` y llama a `load()` — el mismo patrón que ya usa el thumbnailer para cerrar sus videos. Al
terminar, con éxito **o con error**, recarga el clip (si no, tras un fallo el reproductor se quedaría
en negro).

**El main reintenta.** Cerrar el handle es asíncrono: entre que el renderer suelta el video y el main
renombra puede quedar una ventana. Y el reproductor no es el único que puede tener el archivo tomado
(indexador de Windows, antivirus). El rename pasa a reintentarse ante `EPERM`/`EACCES`/`EBUSY` con
backoff lineal (6 intentos, ~150 ms × n ≈ 3 s en total). Si tras eso sigue bloqueado, el error deja
de ser un EPERM crudo y dice en español qué pasó y qué hacer.

## Archivos / módulos afectados

- `src/main/export/audio-edit.ts` — `renameWithRetry` (reintentos + mensaje en español) y `deps`
  inyectables (`rename`, `sleep`) para poder testearlo.
- `src/renderer/views/Editor.tsx` — `soltarVideo()` antes de guardar; recarga del reproductor en
  ambos desenlaces.
- Tests: `audio-edit.test.ts` (regresión del EPERM y bloqueo persistente), `editor.test.tsx`
  (el video se suelta antes de invocar el guardado; tras un error vuelve a cargar).

## Decisiones y alternativas consideradas

- **Reintentar en vez de solo soltar el video**: soltarlo arregla el caso conocido, pero un bloqueo
  ajeno (antivirus) seguiría matando el edit. El reintento es barato y cubre los dos.
- **No tocar el protocolo de medios**: quitarle `stream` rompería el buffering del reproductor
  (y las Range requests que usa la preview en hover). El problema no es que el protocolo abra el
  archivo, es que se intente reemplazar mientras se lee.
- **Copiar sobre el original en vez de renombrar**: peor. El rename es atómico; una copia deja el
  clip a medio escribir si falla, y en Windows tampoco puede escribir sobre un archivo bloqueado.

## Riesgos

- Si otro programa (un reproductor externo) tiene el clip abierto, el edit sigue sin poder aplicarse.
  Es inevitable, pero ahora el usuario lee por qué en vez de un EPERM.

---

**Estado:** ✅ aprobado por el owner (2026-07-11) e implementado
