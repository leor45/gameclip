# Plan — Preview al pasar el cursor sobre la tarjeta (biblioteca)

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Todo vive en el renderer: el protocolo `gameclip-media://clip/<id>` ya sirve el video con `stream:
true` (soporta Range), así que un `<video>` puede reproducir los primeros segundos sin descargar el
archivo entero. No hace falta ni un canal IPC nuevo ni generar previews en disco.

### El estado es "qué tarjeta está apuntada", y vive en la grilla

La grilla (`Biblioteca`) guarda `previewId: number | null`. La tarjeta avisa con
`onHoverChange(activo)` y la grilla decide. Ponerlo ahí (y no un booleano por tarjeta) es lo que
garantiza **una preview a la vez**: si el estado fuera local, un `mouseleave` perdido (cambio de
foco de la ventana, re-render, scroll con el mouse quieto) dejaría un `<video>` reproduciendo detrás.

### Arranque diferido y montaje del `<video>`

`ClipCard` arranca un `setTimeout` de 250 ms en `mouseenter`/`focus` y lo cancela en
`mouseleave`/`blur` (y al desmontar). Cumplido el plazo, se **monta** un `<video>` sobre el
thumbnail:

- `muted` + `playsInline` + `autoPlay`, `preload="metadata"`, `poster` = el thumbnail actual (nada
  de flash negro mientras llega el primer fotograma).
- El bucle de 10 s se hace a mano en `onTimeUpdate`: `if (currentTime >= 10) currentTime = 0`. El
  atributo `loop` sirve solo para el clip corto (< 10 s), y como el corte es por tiempo, ambos casos
  quedan cubiertos con la misma condición.
- Al salir, el `<video>` se **desmonta** (no se pausa y se deja): así se corta la lectura del
  archivo y se libera el decodificador; con 30 tarjetas en pantalla eso importa.

`prefers-reduced-motion: reduce` (vía `window.matchMedia`) desactiva el montaje: queda el borde y el
thumbnail.

### Borde

CSS puro: `.clip-card:hover, .clip-card:focus-within { border-color: #fff }`. La tarjeta ya tiene
borde propio, así que solo cambia el color — no se altera el layout (nada de sumar 1 px y correr la
grilla).

## Archivos / módulos afectados

- `src/renderer/views/Biblioteca.tsx` — `previewId` y el handler que pasa a cada tarjeta.
- `src/renderer/components/ClipCard.tsx` — temporizador de 250 ms, montaje/desmontaje del `<video>`,
  bucle de 10 s, respeto de `prefers-reduced-motion`.
- `src/renderer/styles.css` — borde blanco en hover/focus y encaje del `<video>` en el marco 16:9
  existente (mismo `object-fit: contain` que la imagen, para no romper el fix de las cards
  uniformes).
- `src/renderer/lib/media.ts` — sin cambios (ya existe `clipMediaUrl`).
- Tests: `biblioteca.test.tsx` — la preview aparece tras el retardo, hace bucle a los 10 s, se
  descarta al salir, solo hay una a la vez, y no aparece con `prefers-reduced-motion`. Con
  temporizadores falsos (`vi.useFakeTimers`), y `HTMLMediaElement.play` stub (jsdom no reproduce).

## Decisiones y alternativas consideradas

- **Reproducir el MP4 original** en vez de generar un GIF/webm de preview al guardar el clip: el
  archivo ya está local y el protocolo soporta Range; generar previews costaría un pase de ffmpeg
  por clip y ocuparía disco, justo lo que la Fase 10 acaba de ordenar.
- **Estado en la grilla, no en la tarjeta**: garantiza una sola preview viva. Es la diferencia entre
  "se ve bien" y "la app decodifica ocho videos porque se perdieron ocho `mouseleave`".
- **Desmontar el `<video>` al salir** en vez de pausarlo: pausar deja el búfer y el decodificador
  vivos por tarjeta.
- **Bucle a mano en `onTimeUpdate`** en vez de `loop` + `<video>` recortado: HTML no permite acotar
  la reproducción a un rango; los fragmentos por Media Fragments (`#t=0,10`) no son fiables en todos
  los contenedores.
- **250 ms de retardo**: suficiente para que barrer la grilla no dispare nada, imperceptible cuando
  el usuario se detiene de verdad.

## Riesgos

- **Coste de decodificar mientras se navega**: mitigado por una preview a la vez, el retardo y el
  desmontaje al salir.
- **Clips en carpetas de red o unidades lentas**: el `<video>` puede tardar; el `poster` sostiene la
  imagen mientras tanto (nunca se ve negro).
- **jsdom no reproduce video**: los tests verifican el montaje/desmontaje del elemento, sus atributos
  (`muted`, `src`) y la lógica del bucle disparando `timeUpdate` a mano, no la reproducción real. El
  movimiento se comprueba en la app.

---

**Estado:** ✅ aprobado el 2026-07-11
