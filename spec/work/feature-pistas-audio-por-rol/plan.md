# Plan — Pistas de audio por rol, ordenadas y nombradas

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Tres piezas, de la más pura a la más integrada:

**1. Reparto de pistas por rol (núcleo, todo testeable en aislado).**
Hoy `audioTrackPlan(separate)` devuelve máscaras fijas. Se reemplaza por un helper que
recibe el contexto real (modo de audio, `separateAudioTracks`, y la **lista ordenada de apps
activas**) y devuelve dos cosas: (a) cómo mapear cada fuente a su máscara `audioMixers`, y
(b) la lista de pistas a crear `{ index, name }`. Layout objetivo en modo `apps` + separadas:

| Pista | bit | Nombre | Fuente |
|---|---|---|---|
| 1 | `0b000001` | `default` | mezcla de todo |
| 2 | `0b000010` | `game` | audio del juego |
| 3 | `0b000100` | `mic` | micrófono |
| 4 | `0b001000` | `<app1>` | app activa #1 |
| 5 | `0b010000` | `<app2>` | app activa #2 |
| 6 | `0b100000` | `<app3>` | app activa #3 |

Máscara de cada fuente = su bit propio **OR** el bit 1 (mezcla). El resto de modos/casos
(`escritorio`, o `separateAudioTracks: false`) devuelven exactamente el plan actual → sin
regresión. `buildAudioSources` consume el nuevo plan: asigna `audioMixers` por fuente y crea
las pistas con nombre por índice.

**2. Tope de 3 apps con audio en modo `apps`.**
El límite duro de libobs es 6 pistas; 3 fijas dejan 3 para apps. Se añade una constante
`AUDIO_APPS_TRACK_MAX = 3` y la normalización de settings desmarca (no borra) las apps
activas que excedan el tope, de forma determinista (orden de la lista). La UI de audio ya
tiene el patrón de `limiteAlcanzado` para `AUDIO_APPS_MAX`; se añade el aviso análogo del
tope de apps *con captura* y se impide marcar una cuarta.

**3. Nombres en el MP4 vía remux post-grabación (la parte con costo).**
libobs no escribe los nombres en el MP4 (spike confirmado). Tras la señal `wrote` de una
grabación hecha con el layout por rol, se hace un remux con el ffmpeg bundleado:
`ffmpeg -i clip.mp4 -map 0 -c copy -metadata:s:a:N title=<n> -metadata:s:a:N handler_name=<n> tmp.mp4`
y se reemplaza el original de forma atómica (rename). Se dispara **solo** cuando el reparto
por rol está activo (no toca el clip en modo escritorio ni sin pistas separadas). Los nombres
de las pistas ya se conocen del plan (pieza 1), así que el remux no inspecciona nada: mapea
índice→nombre y copia streams (sin recodificar, ~centésimas de segundo por el `-c copy`).

## Archivos / módulos afectados

- `src/main/capture/obs.ts` — reemplazar `audioTrackPlan` por el helper por rol; export puro
  para tests; `buildAudioSources` crea pistas nombradas y asigna máscaras; helper
  `appTrackName(executable)` (sin `.exe`).
- `src/shared/capture.ts` — `AUDIO_APPS_TRACK_MAX = 3`; normalización que respeta el tope de
  apps activas en modo `apps`.
- `src/renderer/views/ajustes/Audio.tsx` — aviso/límite de 3 apps con audio.
- `src/main/capture/manager.ts` (o donde se maneje la señal `wrote`) — enganchar el remux de
  nombres tras cerrar el archivo, condicionado al layout por rol.
- Nuevo `src/main/capture/track-names.ts` (o util junto a obs) — remux con ffmpeg-static,
  reemplazo atómico, y manejo de error best-effort (si el remux falla, queda el clip sin
  nombres pero íntegro).
- Tests: `src/main/__tests__/obs-helpers.test.ts` (helper de reparto + `appTrackName`),
  normalización en el test de settings, y `ajustes.test.tsx` para el aviso de la UI.

## Decisiones y alternativas consideradas

- **Nombres por remux ffmpeg vs cambiar a contenedor MKV.** MKV lleva títulos de pista
  nativos, pero cambiar el contenedor rompe reproductor interno, editor, miniaturas y
  biblioteca (todos asumen MP4). El remux es local, ya tenemos ffmpeg-static y es `-c copy`
  (sin recodificar). Se elige remux.
- **Remux siempre vs solo con layout por rol.** Solo cuando aplica: evita tocar clips que no
  ganan nada y ahorra el paso en el caso común (modo escritorio).
- **Desmarcar apps que exceden el tope vs borrarlas.** Desmarcar: no se pierde la config del
  usuario; si desactiva otra, la cuarta puede reactivarse.
- **`title` vs `handler_name` en el MP4.** El spike mostró `handler_name` legible de vuelta;
  se escriben ambos (`title` para players que lo lean, `handler_name` como respaldo).

## Riesgos

- **Nombres en MP4 dependientes del player.** El remux deja `handler_name`/`title`, pero cada
  reproductor/editor decide si los muestra. El criterio de aceptación se ancla en lo que
  `ffmpeg` relee (verificable), no en un player concreto. Si más tarde el editor propio los
  quiere mostrar, es otra tarea.
- **Nombres de pista "pegados" dentro de una sesión de libobs.** Las pistas son globales y se
  crean una vez por sesión (`audioTracksCreated`); cambiar la lista de apps sin reiniciar
  libobs puede dejar un nombre viejo en un índice. Mitigación: los nombres viven en el remux
  (pieza 3), que se recalcula por grabación desde los settings vigentes, así que el MP4 sale
  correcto aunque el nombre interno de libobs esté desfasado. A validar en la E2E.
- **Remux sobre el clip del replay buffer.** El buffer escribe el archivo al guardar; hay que
  remuxar después del `wrote`, no antes, y de forma atómica para no dejar el clip a medias si
  la app se cierra en el medio (rename sobre el mismo volumen).
- **Coste por clip.** `-c copy` es barato, pero suma I/O de reescribir el MP4. Aceptable para
  grabaciones puntuales; si molesta en clips largos, se puede evaluar remux in-place.

---

**Estado:** ⏳ pendiente de aprobación
