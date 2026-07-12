# Spec — Captura de escritorio vs captura de juego

**Tipo:** Feature
**Rama:** `feature/captura-escritorio-vs-juego`
**Fecha:** 2026-07-12

## Problema / Objetivo

Hoy la captura no distingue entre "estoy grabando el escritorio" y "estoy grabando un juego":

1. **Audio.** El modo de audio (`audioMode`: `desktop` | `apps`) y las pistas separadas
   (`separateAudioTracks`) se aplican siempre, haya juego o no. Con el audio configurado por
   aplicaciones, una grabación de escritorio sale troceada por app y con pistas separadas — y
   **no captura el audio del resto del PC** (todo lo que no esté en la lista de apps se pierde).
   El audio por aplicación solo tiene sentido cuando se graba un juego.

2. **Vídeo.** El check "Cambiar automáticamente a captura de juego al lanzarse un juego"
   (`desktopAutoSwitchToGame`) no cambia nada de forma real: la escena de libobs **siempre** lleva
   `monitor_capture`, y el check solo decide si además se apila un `game_capture` encima en modo
   `any_fullscreen`. Si esa capa no engancha (juego en ventana / sin bordes) se graba el escritorio
   entero. No hay ninguna reacción a la detección de juego.

3. **No se puede desactivar la grabación de escritorio.** Quien solo quiere clips de juego no tiene
   forma de decirlo.

**Causa raíz:** no existe el concepto de *perfil de captura*. La escena y las fuentes de audio se
deciden una sola vez en `buildPipeline()` a partir de los ajustes, ignorando la detección de juego
(`manager.applyActiveGame()` evita reconstruir el pipeline a propósito, porque un rebuild destruye
el replay buffer).

**Objetivo:** que la captura tenga un perfil explícito derivado de los ajustes + la detección de
juego, y que vídeo y audio se configuren según ese perfil.

### Perfil de captura (regla)

| Grabación de escritorio | Auto-switch | ¿Juego detectado? | Perfil |
|---|---|---|---|
| Activa | Activo | Sí | **game** |
| Activa | Activo | No | **desktop** |
| Activa | Inactivo | Sí o No | **desktop** |
| Inactiva | (irrelevante) | Sí | **game** |
| Inactiva | (irrelevante) | No | **none** (no se captura nada) |

### Comportamiento por perfil

- **game** — vídeo: solo `game_capture` apuntando al juego detectado; el escritorio no aparece.
  Audio: los ajustes del usuario tal cual (modo `apps` con audio por aplicación y pistas separadas
  si los tiene configurados).
- **desktop** — vídeo: solo `monitor_capture` del monitor elegido. Audio: **todo el audio del PC**
  (una única salida de sistema), ignorando el modo `apps`, la lista de aplicaciones y
  `separateAudioTracks`. El reparto de pistas lo decide un ajuste propio de la sección Escritorio:
  todo mezclado en una pista, o PC y micrófono en pistas separadas.
- **none** — no se captura: el buffer no corre y grabar / guardar replay quedan bloqueados con un
  motivo visible ("no hay juego detectado y la grabación de escritorio está desactivada").

## Alcance

**Dentro:**
- Nuevo ajuste `desktopRecordingEnabled` (por defecto activo) en la sección Escritorio, como
  interruptor maestro: apagado, sus controles hijos quedan deshabilitados.
- Nuevo ajuste `desktopAudioTracks` (`mixed` | `separate`, por defecto `mixed`) en la sección
  Escritorio: cómo se reparten las pistas en una captura de escritorio.
- `desktopAutoSwitchToGame` pasa a hacer lo que promete: cambia la fuente de vídeo a captura de
  juego cuando aparece un juego. Solo aplica con la grabación de escritorio activa.
- El pipeline se reconstruye cuando cambia el perfil (aparece/desaparece el juego). Con una
  grabación en curso el rebuild se aplaza hasta que termine: nunca se corta un clip a medias.
- Subir la versión de la app a `0.2.0` para el release.
- Tests: matriz de perfiles, ajustes efectivos de audio/vídeo, manager (rebuild por cambio de
  perfil, bloqueo en perfil `none`) y UI de Ajustes.

**Fuera (explícito):**
- El editor y la exportación no cambian: siguen leyendo las pistas del archivo tal como están.
- `forceWindowCapture` y `advancedWindowCapture` (sección Avanzado) se dejan como están.
- El `AutoSwitcher` (rotar el juego activo entre varios juegos) no cambia.
- Nada de UI nueva fuera de la sección Escritorio.

## Criterios de aceptación

- [ ] Con la grabación de escritorio activa y sin juego, un clip contiene **todo el audio del PC**
      (Spotify, navegador, notificaciones…) aunque el audio esté configurado por aplicaciones, y el
      número de pistas es el elegido en `desktopAudioTracks`.
- [ ] Con un juego corriendo y el auto-switch activo, el clip muestra **solo el juego** (también con
      el juego en ventana sin bordes) y el audio vuelve a respetar la configuración por aplicaciones
      y las pistas separadas.
- [ ] Con la grabación de escritorio desactivada: sin juego no se graba nada (buffer parado; grabar
      y guardar replay devuelven un motivo); con juego se graba solo el juego.
- [ ] Con la grabación de escritorio activa y el auto-switch desactivado, se graba el escritorio
      aunque haya un juego corriendo (comportamiento actual del check desmarcado).
- [ ] Un clip en curso nunca se corta por la aparición/desaparición de un juego.
- [ ] Gates verdes: type-check · lint · tests.
