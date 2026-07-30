# Plan — Captura de pantalla: monitor propio y compatibilidad HDR

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Tres piezas que se apoyan una en otra. La 1 es la que arregla el bug; la 3 es la que hace que el
monitor HDR sea capturable; la 2 es lo que el owner pidió poder elegir.

### 1. Emparejamiento estricto display↔fuente (núcleo del fix)

Se extrae a una función **pura** el trozo que hoy falla, para poder testearlo sin Electron (el
`screenshots.test.ts` actual es casi un stub justo por esa dependencia):

```ts
// src/main/capture/screenshot-target.ts
export type ScreenshotFailure =
  | 'sin-monitores'        // no hay displays (no debería pasar)
  | 'monitor-ausente'      // el índice elegido ya no existe (monitor desconectado/apagado)
  | 'monitor-no-capturable'// el monitor existe pero no está entre las fuentes → HDR
  | 'fuentes-ambiguas';    // capturador sin display_id y no se puede desambiguar

export function pickScreenshotSource(input: {
  displays: { id: number; width: number; height: number }[]; // orden de getAllDisplays
  primaryId: number;
  monitorIndex: number;                                      // -1 = principal
  sources: { display_id: string; width: number; height: number }[]; // width/height del thumbnail
}): { ok: true; sourceIndex: number } | { ok: false; reason: ScreenshotFailure }
```

Reglas, en orden:

1. **Display objetivo:** `monitorIndex === SCREENSHOT_MONITOR_PRIMARY (-1)` → el `primaryId`; si no,
   `displays[monitorIndex]`, y si no existe → `monitor-ausente`.
2. **Ruta DXGI** (alguna fuente trae `display_id` no vacío): match **estricto** por
   `Number(display_id) === display.id`. Sin match → `monitor-no-capturable`.
   **Aquí muere el bug:** se elimina el `?? sources[monitorIndex] ?? sources[0]`.
3. **Ruta GDI** (ninguna fuente trae `display_id` — es lo que devuelve Chromium con
   `DirectXCapturer` desactivado, verificado en la prueba): se empareja por **posición**, porque
   Chromium y el módulo `screen` de Electron enumeran ambos con `EnumDisplayMonitors`, y se
   **valida por relación de aspecto** del thumbnail contra la del display objetivo (tolerancia ~2 %).
   Si la posición no valida, se busca una fuente **única** cuyo aspecto encaje. Si
   `sources.length !== displays.length` o quedan varias candidatas → `fuentes-ambiguas`
   (se falla, no se adivina).
4. Thumbnail vacío (`png.length === 0`, fullscreen exclusivo) lo sigue tratando `takeScreenshot`.

En la prueba real el aspecto desambigua de sobra: 2560x1440 → thumbnail 640x360 y 1080x1920 → 203x360.

`takeScreenshot` pasa a devolver un resultado discriminado en vez de `string | null`, para poder
avisar del motivo:

```ts
type ScreenshotResult = { ok: true; path: string } | { ok: false; reason: ScreenshotFailure | 'captura-vacia' | 'error' };
```

### 2. Ajuste propio del monitor de capturas

- `screenshotMonitorIndex: number` en `CaptureSettings`, default `SCREENSHOT_MONITOR_PRIMARY = -1`
  («seguir al monitor principal»). Normalización: entero en `[-1, SCREEN_MONITOR_INDEX_MAX]`, si no
  → default. Queda **desacoplado** de `screenMonitorIndex`, así que el modal «Grabar escritorio…»
  deja de arrastrar las capturas.
- Selector dentro del `fieldset` que ya existe, «Capturas de pantalla» (`Grabacion.tsx:196-207`),
  junto a `screenshotsEnabled` y al atajo, con la misma lista `displays` que ya carga esa vista + la
  opción «Seguir al monitor principal».
- **Independiente de la grabación, también en la UI:** el selector de grabación de escritorio está
  `disabled={!escritorio}` (`Grabacion.tsx:327`, con `escritorio = settings.desktopRecordingEnabled`
  en la línea 87). El nuevo se habilita con `screenshotsEnabled` y nada más, para el caso del owner:
  capturas activas con la grabación apagada (incluido `recordingMode: 'off'`).

### 3. Compatibilidad HDR (opt-in, con relanzado automático)

`screenshotHdrCompatibility: boolean` (default `false`). Se aplica **antes de `ready`**, en el mismo
bloque donde ya se lee el store para `hardwareAcceleration` (`src/main/index.ts:71-77`):

```ts
if (settingsStore.load().screenshotHdrCompatibility) {
  // Único uso de commandLine en el repo: si se agrega otro disable-features, hay que concatenar.
  app.commandLine.appendSwitch('disable-features', 'DirectXCapturer');
}
```

Chromium cae entonces al capturador GDI, que enumera **todos** los monitores (incluido el HDR) y
entrega la composición SDR ya tonemapeada por Windows — o sea, la conversión HDR→SDR sale gratis, sin
tonemapping propio. Verificado en la máquina del owner: de 1 fuente a 2, y el PNG del monitor HDR
sale con contenido real y colores correctos (incluso con un juego a pantalla completa).

**Por qué hace falta reiniciar** (a diferencia del `hdrCompatibility` de vídeo, que es un ajuste de
fuente de libobs y se aplica en caliente): esto es un switch de Chromium y la `FeatureList` se congela
al arrancar el proceso. **Medido:** aplicándolo después de `ready`, Chromium registra el switch
(`hasSwitch=true`, valor `DirectXCapturer`) pero `getSources()` sigue devolviendo 1 sola fuente, sin
el monitor HDR. No hay toggle en caliente por esta vía.

**Relanzado automático** al cambiar el ajuste, siguiendo el patrón que ya existe para el auto-inicio
elevado (`applyElevatedChange` / `relaunchElevatedIfNeeded`, `src/main/index.ts:484-511`):

```ts
// solo cuando el valor CAMBIA, igual que applyElevatedChange
app.releaseSingleInstanceLock();
app.relaunch({ execPath: currentExecutablePath(), args: currentAppArgs() });
quitting = true;
app.quit();
```

Se reutilizan `currentExecutablePath()` y `currentAppArgs()` (`src/main/index.ts:474-482`): la
primera devuelve `PORTABLE_EXECUTABLE_FILE ?? process.execPath`, que es lo que hace que el relanzado
funcione en el portable —donde `execPath` es la copia efímera en `%TEMP%`— sin reinventar nada.

**Guarda:** nunca relanzar con una grabación en curso (`state === 'recording'`), que se perdería. En
ese caso el ajuste se persiste y se avisa que se aplica al próximo arranque. Con `state === 'buffering'`
sí se relanza —es el estado normal con `bufferMode: 'always'`, así que exigir `idle` sería no
relanzar nunca— pero el diálogo avisa que se pierde el búfer de repetición. La decisión de relanzar
sale de un helper puro testeable:

```ts
export function debeRelanzarPorHdr(prev: boolean, next: boolean, state: CaptureState): boolean
```

El diálogo de confirmación (`dialog.showMessageBox`, «Reiniciar ahora» / «Al próximo arranque») vive
en main, donde ya está el resto de la lógica de relanzado.

Checkbox en **Ajustes → Avanzado → Captura** (`Avanzado.tsx:151-193`), junto a `hdrCompatibility`.

### 4. Aviso al fallar

Hoy la hotkey descarta el fallo en silencio (`if (path) overlay?.showToast(...)`,
`src/main/index.ts:411-415`). Pasa a mostrar un toast con el motivo, y con `monitor-no-capturable`
—el caso HDR— el texto apunta a la casilla: así el opt-in es descubrible en vez de un callejón sin
salida. Mismo motivo devuelto por IPC para la vía de la UI.

## Archivos / módulos afectados

- `src/main/capture/screenshot-target.ts` — **nuevo**: `pickScreenshotSource` puro + tipos de fallo.
- `src/main/capture/screenshots.ts` — usa el helper; borra el fallback a otro monitor; devuelve
  `ScreenshotResult`; pide `thumbnailSize` del display objetivo (sin cambio).
- `src/main/capture/screenshot-action.ts` — pasa `screenshotMonitorIndex` (no `screenMonitorIndex`) y
  propaga el motivo.
- `src/shared/capture.ts` — `screenshotMonitorIndex` + `screenshotHdrCompatibility` en la interfaz,
  defaults, normalización y la constante `SCREENSHOT_MONITOR_PRIMARY`.
- `src/shared/ipc.ts` — la respuesta de `CaptureTakeScreenshot` pasa de `string | null` a
  `ScreenshotResult`.
- `src/preload/index.ts` — tipo de `takeScreenshot`.
- `src/main/index.ts` — el switch de Chromium antes de `ready`; relanzado automático al cambiar el
  ajuste (reusando `currentExecutablePath()` / `currentAppArgs()`); toast con motivo en la hotkey.
- `src/main/capture/screenshot-hdr.ts` — **nuevo**: `debeRelanzarPorHdr(prev, next, state)` puro, para
  testear la guarda de «no relanzar grabando» sin Electron.
- `src/main/ipc.ts` — `CaptureGetDisplays` usa el mismo emparejamiento para las previews (arregla la
  preview vacía del monitor HDR).
- `src/renderer/views/ajustes/Grabacion.tsx` — selector de monitor de capturas en el `fieldset`
  «Capturas de pantalla», habilitado solo por `screenshotsEnabled` (sin `disabled={!escritorio}`).
- `src/renderer/views/ajustes/Avanzado.tsx` — checkbox de compatibilidad HDR en capturas.
- `src/renderer/__tests__/setup.ts` — el mock de `takeScreenshot` devuelve la forma nueva.
- Tests: `src/main/__tests__/screenshot-target.test.ts` (nuevo), `src/shared/__tests__/capture.test.ts`,
  `src/renderer/__tests__/grabacion.test.tsx`, `src/renderer/__tests__/ajustes.test.tsx`.

## Decisiones y alternativas consideradas

- **Sentinela `-1` para «principal»** — alternativa: guardar siempre un índice concreto. Descartada
  porque al cambiar el monitor principal en Windows habría que reconfigurar a mano; con `-1` el
  comportamiento por defecto es el que el owner esperaba desde el principio.
- **Ajuste separado en vez de reusar `screenMonitorIndex`** — reusarlo es justamente lo que hace que
  «Grabar escritorio…» (que persiste ese índice, `Grabacion.tsx:140-142`) mueva los screenshots.
- **`--disable-features=DirectXCapturer` (GDI) para el HDR** — alternativas descartadas:
  - Flags WGC de Chromium (`AllowWgcScreenCapturer`, `AllowWgcDesktopCapturer`): **probadas, no
    sirven** en Electron 29 — siguen devolviendo 1 sola fuente.
  - Aplicar el switch en caliente: **probado, no funciona** (la `FeatureList` ya está inicializada).
    De ahí el relanzado.
  - **Proceso helper** (relanzar el propio exe con `--screenshot-helper` solo para la captura): evita
    el reinicio y no cambia el capturador de la app entera. **Medido: ~220 ms** de arranque en frío +
    captura (228/213/217 ms), bastante más barato de lo que estimé al principio, y sin binario nuevo
    que firmar. Descartada por decisión del owner en favor del relanzado automático, que no agrega un
    modo de arranque nuevo a `index.ts`. Queda documentada como la salida si el reinicio molesta.
  - Helper GDI propio en .NET/`csc` (como el del overlay) o un frame de libobs: más control, mucho
    más código y un exe más que firmar; se reserva por si GDI de Chromium se queda corto.
- **Relanzar solo, en vez de pedirle al usuario que reinicie** (decisión del owner) — el reinicio es
  inevitable por lo de arriba, así que al menos lo hace la app. Con una grabación en curso no se
  relanza: el ajuste queda persistido para el próximo arranque.
- **Fallar en vez de adivinar** — si el monitor pedido no es capturable, no se captura. Un PNG del
  monitor equivocado guardado en la biblioteca es peor que no tener captura, y es exactamente el bug
  reportado.
- **Encendido por defecto** — se decidió apagado, y el owner lo revisó al ver la medición: esperaba
  que la casilla afectara la *calidad* («que no salga saturada»), cuando en realidad decide si el
  monitor **existe** para `desktopCapturer`. Apagado por defecto la app vendría rota de fábrica en
  cualquier equipo con HDR, así que va encendido y la casilla queda como escape. El aviso de la pieza 4
  sigue teniendo sentido para quien la apague.

## Riesgos

- **El switch es de proceso:** con la casilla activa, *toda* la app usa GDI para `desktopCapturer`
  (screenshots + previews del modal). El pipeline de vídeo va por libobs y **no** se ve afectado, así
  que los clips y el buffer de repetición quedan intactos.
- **El relanzado corta el búfer de repetición** de los últimos segundos (los que hubiera en RAM). El
  diálogo lo avisa, y con una grabación en curso no se relanza. En portable, además, el relanzado
  pasa por la limpieza de temporales que ya existe (`portable-temp.json` / `temp-cleanup.ts`); usar
  `currentExecutablePath()` es lo que evita relanzar la copia efímera de `%TEMP%`.
- **Fullscreen exclusivo:** la captura es siempre del **monitor completo**, y ante un juego en
  fullscreen exclusivo real cualquier capturador de escritorio puede devolver vacío (no está medido
  cuál aguanta mejor; no se usa como argumento para elegir vía). Cae en `captura-vacia`, que ya
  existe. En la prueba del owner un juego a pantalla completa se capturó bien.
- **`display_id` vacío en la ruta GDI** obliga a emparejar por posición; mitigado con la validación
  por aspecto y con `fuentes-ambiguas` antes que adivinar.
- **Cambio de forma en el IPC de screenshot** (`string | null` → objeto): superficie chica (preload,
  hotkey y el mock de tests; ningún componente del renderer lo llama hoy), pero hay que actualizar
  los tres sitios o el type-check lo canta.
- `appendSwitch('disable-features', …)` es hoy el único uso de `commandLine` en el repo: si más
  adelante se agrega otro `disable-features`, hay que concatenar en vez de sobrescribir. Se deja
  comentado en el código.

---

**Estado:** ✅ aprobado el 2026-07-29
