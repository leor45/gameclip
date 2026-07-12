# Plan — Aviso del overlay al detectar el juego

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

### Quién decide qué se muestra: el main

El overlay es (y sigue siendo) **una vista tonta**: el main le manda el estado ya resuelto y la
página solo lo pinta. Eso importa aquí porque el contenido depende de cosas que solo el main conoce
—hotkeys configuradas, modo de grabación, duración del buffer— y porque el overlay es una ventana
aparte, sin acceso a los ajustes.

`OverlayState` gana un `notice`:

```ts
interface OverlayNotice {
  title: string;                                   // "Listo para clipear"
  hotkeys: { key: string; label: string }[];       // [{ key: 'F8', label: 'Guardar el último minuto' }]
}
```

El main lo arma con una función **pura** (`buildGameNotice(settings)`, en `@shared/overlay`):
incluye la fila del replay solo si el modo no es `off`, la de captura solo si `screenshotsEnabled`,
y traduce `replaySeconds` a lenguaje natural ("el último minuto", "los últimos 30 segundos"). Al ser
pura, se testea sin Electron y sin libobs — que es donde se rompen los tests de overlay.

### Cuándo se dispara

En `index.ts` ya se escucha `manager.on('status')`. El disparo es la **transición** `detectedGame:
null → juego` (no cada status: el estado se emite en cada cambio de buffer, y no queremos el aviso
en bucle). `OverlayController.showNotice(notice)` lo muestra y lo retira solo a los ~6 s, con el
mismo patrón de temporizador que ya usa `showToast`.

### La animación

CSS en la página del overlay: `@keyframes` de entrada (`translateY(-100%) → 0`) y de salida. Para
que la salida se vea, el main manda primero `notice: null` con una marca de "saliendo"… — no: se
resuelve **en el renderer**, que es donde vive el DOM. La página guarda el `notice` recibido y, al
llegar `null`, aplica la clase de salida y desmonta al terminar la animación (`onAnimationEnd`). El
main solo dice "mostralo" / "quitalo".

La ventana del overlay hoy mide 300×96: el aviso necesita más alto. Se agranda (≈340×220). Es
transparente y click-through, así que el área extra es invisible y no molesta.

## Archivos / módulos afectados

- `src/shared/overlay.ts` *(nuevo)* — `OverlayNotice` + `buildGameNotice(settings)` (pura) +
  `describeReplayDuration(seconds)`.
- `src/shared/ipc.ts` — `OverlayState.notice`.
- `src/main/overlay.ts` — `showNotice()` con su temporizador; ventana más alta.
- `src/main/index.ts` — dispara el aviso en la transición sin-juego → juego.
- `src/renderer/overlay/Overlay.tsx` — pinta el aviso, anima la salida antes de desmontar.
- `src/renderer/styles.css` (o el CSS del overlay) — keyframes de entrada/salida.
- Tests: `shared/__tests__/overlay.test.ts` (contenido del aviso: hotkeys reales, duración en
  lenguaje natural, modo `off` → sin aviso, captura desactivada → sin fila),
  `renderer/__tests__/overlay.test.tsx` (pinta el aviso y lo quita con la animación de salida).

## Decisiones y alternativas consideradas

- **El contenido lo arma el main con una función pura compartida**: el overlay no puede leer
  ajustes, y una función pura nos deja fijar en tests exactamente qué dice el aviso (que es el
  requisito del owner: hotkeys reales, en español).
- **Disparo por transición, no por estado**: `status` se emite muchas veces por segundo de vida del
  buffer; sin la transición, el aviso reaparecería solo.
- **La animación de salida vive en el renderer**: el main no sabe (ni debe saber) cuánto dura una
  transición CSS. Manda "quitalo" y la página se encarga de irse con gracia.
- **Agrandar la ventana del overlay** en vez de crear una segunda ventana para el aviso: es
  transparente y click-through; una ventana más es coste sin beneficio.

## Riesgos

- **Fullscreen exclusivo**: el aviso no se verá, como el resto del overlay (limitación conocida
  desde la Fase 6). No es una regresión.
- **Juegos que el detector "parpadea"** (aparecen y desaparecen entre sondeos) podrían disparar el
  aviso más de una vez; el detector ya tiene debounce de 2 sondeos al cerrar, así que en la práctica
  no debería pasar.

---

**Estado:** ⏳ pendiente de aprobación
