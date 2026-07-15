# Plan — Re-índice automático de juegos instalados

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Reactivo, apoyado en el sondeo que **ya existe**. El `GameDetector` recorre `tasklist` cada 5 s; se le
añade una **detección de novedad** que pide un re-índice cuando aparece un proceso desconocido:

1. **Línea base al arrancar.** En la primera pasada, el detector guarda el conjunto de claves de proceso
   (`exeKey`) sin disparar nada. Así solo reacciona a procesos que arrancan **después** de la app — que
   es justo "lancé un juego con GameClip abierto".
2. **Novedad en pasadas siguientes.** Para cada clave que no estaba en la base: se registra como vista y,
   si **no** es un juego reconocido (no está en el índice, ni en `KNOWN_GAME_PROCESSES`, ni en
   `customGames`), se marca candidato. Un candidato → el detector emite `'unknown-executable'`.
3. **Throttle.** El detector no vuelve a emitir dentro de `UNKNOWN_EXE_REFRESH_COOLDOWN_MS` (colapsa el
   caso "abro varias apps de golpe"). Además, cada ejecutable solo puede disparar una vez (queda en el
   set de vistos).
4. **Wiring.** `index.ts` engancha `detector.on('unknown-executable', () => void refreshGameIndex())`.
   `refreshGameIndex()` ya existe y hace lo correcto: `refresh()` (con huella) → `setIndex()` en el
   detector → `relabelGames()` idempotente. En la siguiente pasada (~5 s) el juego nuevo ya matchea.

Nada de temporizadores nuevos siempre corriendo: se reutiliza el bucle de 5 s. El re-índice (que sí
lanza PowerShell) solo corre cuando aparece algo desconocido, y con throttle.

### Por qué es barato y no se descontrola

- Al arrancar, **todos** los procesos son "nuevos", pero la línea base los absorbe sin disparar. Solo
  cuenta lo que arranca luego.
- Cada ejecutable desconocido dispara **como mucho una vez** por sesión (set de vistos), y el cooldown
  agrupa ráfagas. El coste por disparo es un `refresh()`, equivalente a un re-escaneo manual (aceptado).
- `refresh()` es concurrente-seguro (`this.refreshing`), así que dos disparos solapados no se pisan.

## Archivos / módulos afectados

- `src/shared/games.ts` — nueva constante `UNKNOWN_EXE_REFRESH_COOLDOWN_MS` (junto a
  `GAME_POLL_INTERVAL_MS`). Valor propuesto: 60 000 ms.
- `src/main/capture/game-detector.ts` — dentro de `poll()`: línea base en la primera pasada; en las
  siguientes, detectar claves nuevas no reconocidas y emitir `'unknown-executable'` con cooldown. Nuevo
  estado privado (`baseline`/`seen`, `lastUnknownEmit`) y opción inyectable del cooldown para tests.
- `src/main/__tests__/game-detector.test.ts` — tests de regresión (fake timers).
- `src/main/index.ts` — en `setupGameDetection`, suscribir `'unknown-executable'` a `refreshGameIndex()`.

## Decisiones y alternativas consideradas

- **Reactivo sobre el sondeo existente** vs **temporizador periódico ciego** (primera propuesta) — se
  elige lo reactivo: no añade un bucle nuevo siempre activo, no gasta PowerShell cuando no pasa nada, y
  reacciona en segundos al lanzar un juego. Es lo que pidió el owner ("como Discord"). Descartado el
  temporizador.
- **Reactivo sobre el sondeo** vs **eventos reales del SO** (WMI `Win32_ProcessStartTrace`, fs.watch,
  registro) — los eventos del SO dan latencia cero pero son frágiles, específicos de plataforma y caros
  de mantener; y Discord tampoco los usa (sondea). El sondeo de 5 s ya está y es suficiente. Descartado.
- **Línea base en la primera pasada** — evita la tormenta de "todo es nuevo" al arrancar y hace que el
  disparo signifique de verdad "algo arrancó después que yo". Sin esto, se re-indexaría al inicio (y ya
  hay un refresco de arranque).
- **Emitir un evento** (`'unknown-executable'`) vs llamar a `refreshGameIndex` desde el detector — se
  emite un evento: el detector no debe conocer el índice/biblioteca; `index.ts` ya es quien orquesta
  `refreshGameIndex` (mismo patrón que `'games-changed'`).
- **Throttle en el detector** vs en el wiring — en el detector, para que el evento ya salga
  rate-limited y `index.ts` quede trivial; y así es testeable en unidad con fake timers.
- **Disparo adicional al recuperar foco la ventana** — se deja fuera (cubierto de sobra por el sondeo);
  fácil de sumar luego si se quiere.

## Riesgos

- **Ruido de procesos que no son juegos** (abres el navegador → dispara un re-índice) — acotado: una vez
  por ejecutable y por sesión, con cooldown, y cada re-índice es barato por la huella. No se mantiene
  ninguna lista negra de "procesos que no son juegos" (justo la trampa que el resto del código evita).
- **Latencia del primer arranque del juego** — el re-índice tarda ~1-3 s; puede que la primerísima
  pasada tras lanzar el juego aún no lo matchee, pero la siguiente (~5 s) sí. Aceptable.
- **Juego cuyo manifiesto tarda en escribirse** — improbable (el launcher ya lo instaló antes de poder
  lanzarlo); si pasara, quedaría cubierto por el `refreshGameIndex()` del siguiente arranque.
- **Parpadeo de UI** — descartado: `relabelGames` no emite `changed` con 0 cambios (`manager.ts:147`).

---

**Estado:** ⏳ pendiente de aprobación
