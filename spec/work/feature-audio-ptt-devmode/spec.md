# Spec — Audio avanzado (PTT, supresión de ruido, lista estilo de las apps de clips) + Development Mode

**Tipo:** Feature
**Rama:** `feature/audio-ptt-devmode` (parte de `feature/settings-avanzados`, aún sin mergear:
mergear aquella primero y esta después)
**Fecha:** 2026-07-11

## Problema / Objetivo

Pedido del owner tras la Fase 7: (1) push-to-talk y supresión de ruido **funcionales** en el
micrófono; (2) la lista de audio en modo apps debe funcionar como en las apps de clips — filas por defecto
ya presentes (Audio del juego, Micrófono y Discord siempre visible aunque no esté corriendo)
con checkbox para activar/desactivar la captura sin quitar la fila, y las apps añadidas con
checkbox + botón de basurero rojo; (3) una sección Development Mode con al menos el toggle de
aceleración por hardware.

## Alcance

**Dentro:**

- **Push-to-talk:** hotkey global (teclado o botones laterales del mouse) que abre el micrófono
  solo mientras se mantiene pulsado. Hook de bajo nivel con `uiohook-napi` (N-API, prebuilt,
  MIT); degradación limpia si el hook no carga (PTT desactivado con aviso, el mic sigue en
  modo normal).
- **Supresión de ruido:** filtro `noise_suppress_filter` de libobs (RNNoise) aplicado a la
  fuente del micrófono vía `FilterFactory` + `addFilter`, con toggle en Ajustes → Audio.
- **Lista de audio (modo apps):**
  - Fila "Audio del juego" (ya existía: checkbox + volumen).
  - Fila "Micrófono" en la lista, con checkbox (`micEnabled`) y volumen — mismo estado que la
    sección de micrófono.
  - **Discord como app por defecto, siempre en la lista** (aunque no esté corriendo), con
    checkbox para activar/desactivar su captura; sin botón de quitar.
  - Apps añadidas por el usuario: checkbox a la izquierda (activar/desactivar sin quitar) +
    botón solo-icono de basurero en rojo para quitarlas.
  - Modelo: `audioApps[]` gana `enabled: boolean`; el pipeline solo crea capturas por proceso
    de las apps habilitadas.
- **Development Mode:** nueva sección "Desarrollo" en Ajustes con el toggle **Aceleración por
  hardware** (default ON). Desactivarla llama `app.disableHardwareAcceleration()` en el
  próximo arranque (aplica antes de `ready`; la UI avisa que requiere reiniciar) con la
  advertencia estilo de las apps de clips (puede romper el editor/reproducción; solo para debugging).

**Fuera (explícito):**

- Logging verboso / SDK mode de las apps de clips (resto de su Development Mode).
- Test de micrófono con playback y slider de dB de la supresión (el toggle usa RNNoise, que
  no requiere umbral); specs propios si se piden.
- PTT por combinaciones de teclas (modificador + tecla); una sola tecla o botón del mouse.
- "las apps de clips Clip Sound" y "NVIDIA Broadcast" de la captura de referencia (no aplican a GameClip).

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] Con PTT activo y un hotkey configurado, el micrófono queda muteado salvo mientras la
      tecla/botón está pulsado (verificable con el estado de la fuente en tests con FakeObs y
      manualmente en la app).
- [ ] Si `uiohook-napi` no carga, la app arranca igual, el mic funciona en modo normal y la UI
      muestra el aviso.
- [ ] Con supresión de ruido activa, la fuente del mic tiene el filtro `noise_suppress_filter`
      (RNNoise); al desactivarla el filtro no se crea (verificable en el selftest real: el
      pipeline construye sin errores en ambos estados).
- [ ] En modo apps la lista muestra siempre: Audio del juego, Micrófono y Discord (aunque no
      corra), cada uno con checkbox y slider; desmarcar no quita la fila.
- [ ] Apps añadidas muestran checkbox + basurero rojo; el basurero quita, el checkbox solo
      desactiva la captura y persiste.
- [ ] El pipeline solo captura las apps con `enabled: true`.
- [ ] La sección Desarrollo permite desactivar la aceleración por hardware; el ajuste persiste,
      avisa del reinicio y en el próximo arranque se aplica antes de `ready`.
- [ ] Ajustes viejos (audioApps sin `enabled`) migran a `enabled: true` vía normalización.
- [ ] Gates verdes: typecheck · lint · tests.
