# Plan — Grabaciones en negro y sin audio

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

**Video (monitor_id).** El source `monitor_capture` expone la propiedad-lista `monitor_id`
cuyos items tienen nombre `"NOMBRE: WxH @ x,y"` y como value el device id de Windows
(verificado con probe en esta máquina: coordenadas idénticas al `nativeOrigin` de Electron).
Tras crear el source, se enumeran esos items y un helper puro `resolveMonitorId(items,
display)` elige el device id del display objetivo:

1. match exacto por tamaño físico **y** posición (`WxH @ x,y`);
2. si no, por posición sola (el origen nativo es único por monitor);
3. si no, por tamaño solo cuando es inequívoco (un único item con ese tamaño);
4. si no, `Auto` (comportamiento actual).

El display objetivo viaja por `CaptureEnvironment.displayByIndex`, que pasa de devolver
`{width, height}` a `{width, height, x, y}` (tamaño físico = `size * scaleFactor`, posición
= `nativeOrigin`). Se deja de pasar la key legacy `monitor` (esta build la ignora salvo en
el fallback `Auto`, donde además indexa con OTRO orden de enumeración — es la trampa que
causó el bug).

**Audio (use_device_timing).** Las fuentes `wasapi_output_capture` (principal y fallback) se
crean con `use_device_timing: false` para que libobs timestampe con el reloj del OS; con el
reloj del dispositivo, salidas HDMI/DP en reposo acumulan lag (~147 s en el log) y libobs
descarta todo el audio. El mic (`wasapi_input_capture`) ya usa timing de OS por defecto y no
se toca.

**Verificación E2E.** Selftest de grabación existente + tono de audio reproducido por los
altavoces durante la captura; el MP4 resultante se analiza con ffmpeg (`blackdetect`,
`volumedetect`). El probe temporal de monitores se elimina al cerrar el fix.

## Archivos / módulos afectados

- `src/main/capture/obs.ts` — helper puro `resolveMonitorId()`; `monitorSettings()` sin la
  key legacy; resolución de `monitor_id` en `buildPipeline()` (update tras crear el source);
  `use_device_timing: false` en las dos fuentes de escritorio; se retira el probe temporal.
- `src/main/capture/manager.ts` — `CaptureEnvironment.displayByIndex`/`primaryDisplay` con
  `{width, height, x, y}`; pasa el display completo a `buildPipeline`.
- `src/main/index.ts` — `displaySize()` incluye `nativeOrigin`; se retira el probe temporal
  del selftest.
- `src/main/__tests__/obs-helpers.test.ts` — regresión de `resolveMonitorId` (datos reales
  de esta máquina) y de los settings de audio de escritorio.
- `src/main/__tests__/capture-manager.test.ts` — env de test con la nueva forma del display.

## Decisiones y alternativas consideradas

- **Matchear por tamaño+posición del item name** — alternativa: matchear por label de
  Electron vs nombre del monitor. Descartada como clave primaria: dos monitores iguales
  comparten label; la posición es única por definición del escritorio virtual.
- **Dejar de pasar `monitor` (int legacy)** — alternativa: pasarlo como hint. Descartada:
  con `monitor_id` resuelto se ignora, y en el fallback `Auto` indexa con la enumeración de
  libobs (≠ Electron), que es exactamente el bug.
- **`use_device_timing: false` fijo** — alternativa: exponerlo como ajuste. Descartada: no
  hay caso de uso conocido para el timing del dispositivo en loopback; menos superficie.

## Riesgos

- Setups multi-DPI: `nativeOrigin` es físico y coincide con las coordenadas de libobs
  (verificado con probe); si algún driver reporta otra cosa, el helper degrada a `Auto`
  (= comportamiento de hoy, nunca peor).
- El formato del item name (`"NOMBRE: WxH @ x,y"`) es de esta build de libobs; si osn
  actualiza y cambia, el fallback `Auto` mantiene la captura viva. El parseo va con regex
  tolerante y testeado.

---

**Estado:** ✅ aprobado el 2026-07-11 (aprobación delegada por el owner en esta sesión:
"una vez que propongas el plan apruébalo tú mismo, te delego esas tareas")
