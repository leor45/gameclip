# Spec — Un micrófono guardado que ya no existe deja el mic mudo y la UI lo enmascara

**Tipo:** Fix
**Rama:** `fix/mic-desconectado`
**Fecha:** 2026-10-08

## Problema / Objetivo

Auditoría bug-hunter B, BUG-9 (Medium). Reproducido hoy en la máquina del owner: el `micDeviceId`
guardado (`{0.0.1.00000000}.{c125ff3b-…}`) no figura entre los dispositivos de captura de Windows y la
pista de micrófono de **todos** los clips sale a −91 dB.

**Causa raíz, en dos capas:**
- **Main:** `buildAudioSources` crea el `wasapi_input_capture` con `device_id: settings.micDeviceId`
  tal cual; con un id inexistente libobs espera al dispositivo para siempre (fuente muda) y no hay
  fallback.
- **Renderer:** en Ajustes → Audio el `<select>` controlado tiene un `value` sin opción coincidente y
  pinta la primera («Por defecto del sistema»), así que el usuario cree que está en el micro por
  defecto cuando en realidad el ajuste apunta a un dispositivo fantasma.

## Alcance

**Dentro:**
- Helper puro `resolveMicDevice(micDeviceId, devices)` en `@shared/capture`: `default` si el id está
  vacío o es `default`; si hay dispositivos enumerados y el id no está entre ellos → `default` con
  `missing: true`; si la enumeración viene vacía (osn no pudo enumerar) se respeta el id.
- `obs.ts`: resolver el dispositivo del mic con ese helper al construir el pipeline (fallback a
  `default` cuando falta), registrando el fallback en el log.
- `Audio.tsx`: cuando el id guardado no está en la lista, mostrarlo como opción seleccionada
  «Micrófono guardado (no conectado)» y un aviso con lo que está pasando y qué hacer.
- Tests de regresión en shared, obs-helpers y renderer.

**Fuera (explícito):**
- Detectar en caliente que el micro se desconecta/reconecta (haría falta un rebuild por evento).
- Avisar en el overlay o la barra de captura.

## Criterios de aceptación

- [ ] Con `micDeviceId` ausente de la enumeración y al menos un dispositivo enumerado, libobs recibe
      `device_id: 'default'`.
- [ ] Con la enumeración vacía, el id guardado se respeta (no se degrada a ciegas).
- [ ] Ajustes → Audio con un id huérfano muestra la opción «(no conectado)» seleccionada y el aviso;
      elegir otro dispositivo y guardar lo reemplaza.
- [ ] Suite verde.
