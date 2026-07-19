# Plan — El game capture no engancha ventanas cuyo ejecutable libobs no puede leer

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Hoy `resolveGameWindow` tiene **un solo criterio**: el último campo de la cadena
`título:clase:ejecutable` tiene que ser igual al ejecutable detectado. Si el anti-cheat impide a
libobs resolver el proceso, ese campo es `unknown` y no hay nada que hacer.

Se le añade **un segundo criterio, subordinado**, que solo entra cuando el primero no encuentra
nada y la ventana candidata tiene el ejecutable como `unknown`.

### 1. Emparejar por título normalizado

Con el ejecutable inutilizable hay que atarse a otro campo. La clase (`stingray_window`) es la
más estable, pero por sí sola no dice **qué juego** es: hace falta un puente entre la ventana y el
juego detectado, y el único dato que tenemos en ese punto es el ejecutable.

El puente es el **título normalizado** (minúsculas, fuera todo lo que no sea alfanumérico):

```
'HELLDIVERS™ 2'    → 'helldivers2'
'helldivers2.exe'  → 'helldivers2'   (sin extensión)
```

Coinciden. Si el título casa, se devuelve la cadena completa de esa ventana —incluido el
`unknown`, tal cual la lista libobs, que es lo que hay que pasarle de vuelta— y el match real lo
hará libobs por **clase**.

Es una heurística, y como tal se comporta: **si no hay una candidata inequívoca, devuelve `null`**
y nos quedamos exactamente como hoy (`any_fullscreen`). Nunca se engancha «la única ventana
`unknown` que haya» a ciegas: apuntar a una ventana ajena sería peor que el estado actual, porque
grabaríamos otra cosa en vez de negro.

### 2. `priority` acompañando a la resolución

Resuelta por título/clase, emitir `priority = clase` en vez del `2` de hoy. El literal de libobs
(`data/obs-plugins/win-capture/locale/en-US.ini`) dice qué significa cada valor:

```
Priority.Title="Window title must match"
Priority.Class="Match title, otherwise find window of same type"
Priority.Exe="Match title, otherwise find window of same executable"
```

No es «matchea solo por este campo»: es un **orden de preferencia** con el título siempre primero.
Por eso `clase` es la correcta aquí — intenta el título y, si el juego lo cambia en marcha, cae a
la clase en vez de a un ejecutable que nunca va a casar.

### 3. El número del enum se mide, no se recuerda

**No se hardcodea de memoria.** Antes de tocar nada se vuelcan los items de la propiedad-lista
`priority` de un `game_capture` real con nombre y valor, igual que ya hace `monitorIdItems` con
`monitor_id`. El número resultante se fija en una constante con nombre y el comentario cita el
volcado. Motivo en Riesgos.

### 4. Audio del juego, por el mismo camino

`processCaptureSettings` construye `::<exe>` y falla por lo mismo. Se le pasa la ventana ya
resuelta, con la misma lógica y la misma constante de prioridad, resolviendo contra la lista de la
propia fuente de audio (patrón idéntico a `aimGameCapture`).

**Esta mitad es separable**: si el hook de vídeo funciona pero el audio no, es porque el bloqueo
del anti-cheat está más abajo de lo que arregla el matcher (ver Riesgos) — y entonces el audio
necesita otra estrategia y otro spec, no más iteración aquí.

## Archivos / módulos afectados

- `src/main/capture/obs.ts`
  - `resolveGameWindow()` — segundo criterio (título normalizado sobre ventanas `unknown`),
    con desempate: si hay más de una candidata, `null`.
  - `gameCaptureSettings()` — recibe cómo se resolvió la ventana y emite la `priority` acorde.
  - `processCaptureSettings()` + `createProcessCapture()` / `updateGameAudioTarget()` — misma
    resolución para el audio por proceso del juego.
  - Constantes de `priority` con el valor medido.
- `src/main/__tests__/obs-helpers.test.ts` — regresión y casos borde.

## Decisiones y alternativas consideradas

- **Título normalizado como puente** — descartado emparejar por **clase sola**: `stingray_window`
  identifica el motor, no el juego, y engancharía cualquier título de Bitsquid/Stingray. Descartado
  también **«la única ventana con exe `unknown`»**: es justo el caso en que no sabemos qué es, y
  falla silenciosamente grabando la ventana equivocada.
- **Fallback conservador a `null`** — descartado forzar siempre alguna ventana. Si la heurística
  no está segura, el comportamiento actual (`any_fullscreen`) es el peor caso aceptable y ya
  conocido.
- **Camino existente intacto** — descartado unificar los dos criterios en una función de
  puntuación tipo `window_rating`. Más elegante, pero cambia el resultado de **todos** los juegos
  que hoy funcionan para arreglar uno. La condición de entrada al camino nuevo es estrecha a
  propósito.
- **Medir el enum** — descartado copiar el mapeo anotado en el roadmap.

## Riesgos

- **El mapeo del enum `priority` que anoté en el roadmap (`0 = título · 1 = clase · 2 =
  ejecutable`) es sospechoso**: lo escribí de memoria y el orden del desplegable en la UI de OBS no
  tiene por qué coincidir con el orden del `enum` en el código. Si están cruzados, pedir «clase»
  acabaría pidiendo «título». Por eso el paso 3 mide antes de tocar, y por eso el roadmap se
  corrige en esta misma rama.
- **La hipótesis puede ser insuficiente.** Está razonada sobre datos medidos, pero lo comprobado es
  que *el matcher no encuentra la ventana*; que el hook **enganche** una vez encontrada no está
  verificado. Si GameGuard además bloquea la inyección de `graphics-hook64.dll` (y no solo la
  lectura del proceso), el arreglo no basta. Que Medal capture HD2 dice que hay una vía; no dice
  que sea esta. **La verificación en máquina real con HD2 es parte del contrato, no un extra.**
- **El audio puede no arreglarse aunque el vídeo sí.** `wasapi_process_output_capture` necesita el
  PID para abrir la sesión de loopback; encontrar la ventana no garantiza obtenerlo.
- **Falsos positivos del título.** Un juego cuyo título normalizado coincida con el ejecutable de
  otro proceso `unknown` engancharía mal. Mitigado por el desempate a `null` y porque el camino
  solo se recorre cuando el match por ejecutable ya falló.
- **Verificación con juego falso imposible.** `cmd.exe` renombrado no tiene swapchain; solo sirve
  para forzar transiciones de perfil, no para validar el hook. Hace falta HD2 de verdad.

---

**Estado:** ⏳ pendiente de aprobación
