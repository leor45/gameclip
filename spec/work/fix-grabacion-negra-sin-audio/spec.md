# Spec — Grabaciones en negro y sin audio (monitor equivocado + loopback descartado)

**Tipo:** Fix
**Rama:** `fix/grabacion-negra-sin-audio`
**Fecha:** 2026-07-11

## Problema / Objetivo

El owner reporta que las grabaciones no sirven: el video sale **100 % negro** y **no se oye
nada**, ni siquiera grabando el escritorio con el monitor seleccionado y "todo el audio del
PC" mientras sonaba YouTube. Verificado con ffmpeg sobre los clips reales:
`blackdetect` marca negro todo el clip y `volumedetect` da −91 dB (silencio digital) en las
dos pistas AAC. El encoder y el muxer funcionan; lo que falla es que las fuentes no capturan.

**Causa raíz 1 — video negro (monitor equivocado).** `ObsCapture.monitorSettings()` pasa
`monitor: screenMonitorIndex` (índice de display de **Electron**) al source
`monitor_capture`. La build de libobs que trae osn 0.26.29 selecciona el monitor por la
propiedad **`monitor_id`** (string de dispositivo, p. ej. `\\?\DISPLAY#AUS2406#…`); la key
legacy `monitor` se ignora y el source cae a `Auto` = monitor **primario**. Log de libobs:
`setting_id: Auto` → `display: ASUS VG24VQE (1080x1920)` (el monitor vertical) mientras el
lienzo era 2560x1440 (el display índice 1 de Electron que eligió el owner). Se grababa un
escritorio secundario vacío → negro. Introducido en la Fase 3 (captura libobs): el índice
funcionaba de casualidad solo si el monitor elegido era el primario.

**Causa raíz 1b — video negro (método DXGI).** Corregido el monitor, el clip seguía negro:
en esta máquina (RTX 4070 Ti, HAGS activo, Windows 11) la duplicación de escritorio **DXGI
entrega frames negros sin loguear error alguno**. Con el método **WGC** (Windows Graphics
Capture, `method: 2`) la captura funciona (verificado E2E: `blackdetect` pasa de "todo el
clip" a cero). El fix hace WGC el método fijo del monitor capture — es la API vigente desde
Win10 1903 y Windows es la plataforma objetivo.

**Causa raíz 2 — audio en silencio (timestamps del loopback).** La fuente
`wasapi_output_capture` (audio del escritorio) se crea con el default
`use_device_timing: true`. Con dispositivos como la salida HDMI/DP (`MO27Q28G NVIDIA High
Definition Audio`), el reloj del dispositivo no corre alineado al reloj del OS (no avanza en
reposo), así que los timestamps llegan ~2,5 min atrás y libobs **descarta todo el audio**:
`Source gameclip-audio audio is lagging (over by 147088.80 ms) at max audio buffering`.
Con `use_device_timing: false` libobs timestampa con el reloj del OS y el audio entra a la
mezcla. Introducido en la Fase 3 junto con la fuente.

**Hallazgo adicional (documentado, fuera de alcance):** en modo de audio `apps` sin juego
corriendo, la única fuente es la captura por proceso "dormida" (window vacío) → una
grabación de escritorio en ese modo queda estructuralmente muda (así salió el clip
13-45-56). Comportamiento por diseño de la Fase 8; si molesta, lleva su propio spec.

## Alcance

**Dentro:**
- Resolver el **`monitor_id`** real del display elegido: enumerar los items de la propiedad
  `monitor_id` del source `monitor_capture` y matchearlos contra el display de Electron
  (tamaño físico y posición); helper puro y testeado `resolveMonitorId()`.
- Pasar por `CaptureEnvironment` la info necesaria del display (tamaño físico + origen
  nativo), no solo `{width, height}`.
- `use_device_timing: false` en las fuentes de audio de escritorio (`wasapi_output_capture`,
  incluida la de fallback).
- Método WGC fijo para `monitor_capture` (helper puro `monitorCaptureSettings()`); DXGI
  queda descartado por entregar frames negros sin error.
- Verificación E2E en máquina real: grabar con contenido visible y audio sonando; el clip
  resultante debe pasar `blackdetect` (sin negro) y `volumedetect` (señal > −60 dB).

**Fuera (explícito):**
- El silencio estructural del modo `apps` sin juego (hallazgo documentado arriba).
- Exponer el método de captura (DXGI vs WGC) como ajuste de UI: WGC queda fijo; si algún
  setup lo necesitara, lleva su propio spec.
- Miniaturas negras de la biblioteca: son consecuencia (se generan del video); no hay fix
  aparte.

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] Test de regresión (rojo→verde): `resolveMonitorId()` elige el device id cuyo tamaño y
      posición coinciden con el display objetivo (datos reales de esta máquina: ASUS
      1080x1920 vs MO27Q28G 2560x1440) y cae a `Auto` si no hay match.
- [ ] Test de regresión (rojo→verde): los settings del audio de escritorio llevan
      `use_device_timing: false` (fuente principal y fallback).
- [ ] `monitor_capture` recibe `monitor_id` resuelto (visible en el log de libobs:
      `setting_id` ya no es `Auto` y `display` es el monitor elegido).
- [ ] E2E en máquina real: clip grabado con el monitor seleccionado mostrando contenido y
      audio reproduciéndose → `blackdetect` no marca todo el clip y `volumedetect` > −60 dB
      en la pista 1.
- [ ] Suite completa verde (typecheck · lint · tests).
