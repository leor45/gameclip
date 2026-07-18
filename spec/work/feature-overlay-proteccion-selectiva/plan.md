# Plan — El overlay de rendimiento sale en capturas externas

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

> **Release:** mismo release que `feature/overlay-rendimiento` y `feature/fps-solo-en-juego`.

## Enfoque

La protección deja de ser un ajuste de creación de la ventana y pasa a ser **estado derivado de la
captura**. Una función pura decide, y el controlador del overlay la aplica:

> proteger ⇔ el perfil construido es `desktop` **y** hay una salida capturando (búfer o grabación)

Con perfil `game` o `none` no se protege nunca: el `game_capture` no puede ver una ventana ajena y con
`none` no hay escena. Esa es la mitad del valor de la feature y sale de una sola condición.

**Dónde engancharlo.** El punto correcto es `CaptureManager.rebuildPipeline()`
(`src/main/capture/manager.ts:589`), justo después de fijar `this.builtProfile` (línea 597): es el
**único** camino por el que pasan todos los cambios de perfil. El estado de "hay algo capturando" ya lo
calcula `shouldBuffer()` (`manager.ts:552`) y lo mueven `startBuffer`/`stopBuffer`
(`manager.ts:561-569`), `doStartRecording`/`doStopRecording` (`manager.ts:465-504`) y
`settleAfterRecording()` (`manager.ts:575`). Se centraliza en un método privado nuevo que recalcula y
notifica, llamado desde esos puntos y desde `shutdown()` (`manager.ts:528`).

**Cómo llega al overlay.** El manager no conoce el `PerfOverlayController` y no debe: emite el estado
y `src/main/index.ts` lo puentea, igual que ya hace con `'settings'` → `settings:changed`. El
controlador expone `setCaptureProtection(boolean)` y solo llama a `setContentProtection` **cuando el
valor cambia**, para no repetir la llamada Win32 en cada reconciliación.

La decisión en sí va a una función pura en `@shared` (o en el propio módulo, sin dependencias de
Electron) para poder testearla contra la matriz de perfiles × estados sin levantar OBS.

## Archivos / módulos afectados

- `src/shared/capture.ts` — función pura `needsContentProtection(profile, capturing)`. Es donde ya
  vive `captureProfile()`, así que la regla queda junto a la que decide el perfil.
- `src/main/capture/manager.ts` — método privado que recalcula el estado y lo emite; llamadas desde
  `rebuildPipeline()`, los arranques/paradas de búfer y grabación, y `shutdown()`.
- `src/main/index.ts` — puente del evento al `PerfOverlayController`.
- `src/main/perf-overlay.ts` — `setContentProtection(true)` fijo en la creación sale; entra
  `setCaptureProtection(boolean)` con guarda de "solo si cambió". La ventana **se crea protegida** y
  se desprotege cuando el estado lo diga (fallar del lado seguro: si algo no se cablea, el overlay
  queda oculto de las capturas, que es el comportamiento actual, no uno peor).
- Tests: `src/shared/__tests__/`, `src/main/__tests__/capture-manager.test.ts` y el del overlay.

## Decisiones y alternativas consideradas

- **Semántica "el pipeline captura el monitor"** — frente a **"el usuario pulsó grabar"**: la segunda
  es la intuitiva y es **incorrecta**, porque el búfer de repetición corre en continuo y desproteger
  mientras corre metería el overlay en cualquier clip que se salve después. Este malentendido se
  detectó analizando el ciclo de vida real, antes de escribir código.
- **Crear la ventana protegida y desproteger después** — frente a crearla desprotegida: si un cable
  falla, el fallo es "no se ve en una captura externa" en vez de "se coló en un clip del usuario".
- **Decisión en una función pura + evento** — frente a que el `PerfOverlayController` consulte al
  manager: evita una dependencia nueva entre módulos y hace testeable la matriz completa sin OBS.
- **Descartado: exclusión por capturador.** No existe en Windows; `WDA_EXCLUDEFROMCAPTURE` es de la
  ventana. Verificado además que la app no configura ninguna lista de exclusión de ventanas en libobs.
- **Descartado: inyección en la swapchain** (ver spec).

## Riesgos

- **Conmutar `setContentProtection` en caliente podría alterar la ventana** — perder el nivel
  `screen-saver`, provocar un parpadeo, o no aplicarse hasta el siguiente repintado. No está
  verificado. Es el riesgo principal y se comprueba a mano en la E2E; si aparece, la mitigación es
  reaplicar `setAlwaysOnTop` tras cada cambio.
- **Ventanas de carrera:** desproteger justo cuando arranca el búfer dejaría unos frames con el
  overlay dentro. Se mitiga recalculando **antes** de arrancar la salida y **después** de pararla —
  o sea, protegiendo pronto y desprotegiendo tarde.
- **Expectativa del owner:** el caso escritorio con los ajustes por defecto **no cambia**. Está en el
  spec, pero conviene no perderlo de vista al validar: es fácil leerlo como que la feature no funciona.
- **Falso negativo en la verificación:** comprobar "no sale en el clip" exige un clip real, no un
  screenshot. La E2E de la Fase 19 ya dejó el método montado (captura GDI de la esquina del overlay).

---

**Estado:** ⏳ pendiente de aprobación
