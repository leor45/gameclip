# Spec — El game capture no engancha ventanas cuyo ejecutable libobs no puede leer

**Tipo:** Fix
**Rama:** `fix/game-capture-ventana-sin-ejecutable`
**Fecha:** 2026-07-18

## Problema / Objetivo

Los clips de **Helldivers 2** salen **en negro y sin audio de juego**. Reportado por un usuario en
la v0.8.1 y reproducido en esta máquina, así que no tiene relación con el overlay de rendimiento
de la 0.9.0.

### Causa raíz (medida, no inferida)

La sonda de diagnóstico (`probe/captura-hook-diagnostico`) volcó la lista de ventanas que expone
libobs durante una misión real. La ventana **está ahí**:

```
HELLDIVERS™ 2:stingray_window:unknown
```

Título y clase correctos (`stingray_window` es el motor de Arrowhead), pero el campo del
ejecutable es **`unknown`**: el anti-cheat (nProtect GameGuard) impide que libobs resuelva el
proceso dueño de la ventana, y libobs escribe ese literal en su lugar.

`resolveGameWindow()` (`src/main/capture/obs.ts`) compara **solo el último campo** de la cadena
contra el ejecutable detectado:

```ts
return partes[partes.length - 1].toLowerCase() === exe;   // 'unknown' !== 'helldivers2.exe'
```

No hay match → devuelve `null` → el `game_capture` se queda en `any_fullscreen`, que **también**
falla porque necesita resolver el mismo proceso (`error acquiring, failed to get window
thread/process ids: 2` en el log). Resultado: `dimensiones game_capture: 0x0`, sin hook, lienzo
negro.

El mismo `unknown` deja mudo el audio del juego: `wasapi_process_output_capture` se configura con
`::helldivers2.exe` y tampoco encuentra a quién engancharse.

**Correlación directa en la sesión medida:**

| Hora (UTC) | Evento |
|---|---|
| 04:13:12 | perfil → `game`, `any_fullscreen`, falla el audio de HD2 |
| 04:15:05 | `Wrote replay buffer to 'Replay 2026-07-18 23-15-05.mp4'` (el clip negro) |
| 04:15:06 | sonda: `dimensiones game_capture: 0x0` |
| 04:15:43 | HD2 cerrado, perfil → `desktop` |

**Descartado por medición:** que haga falta ejecutar como administrador (con privilegios elevados
falla igual); que sea de la 0.9.0 (pasa en la 0.8.1); que HD2 sea incapturable (Medal la captura).

### Objetivo

Que una ventana que libobs ve pero **no puede atribuir a un proceso** se pueda enganchar igual,
resolviéndola por un campo que sí es fiable. Sin tocar el camino de los juegos que hoy funcionan.

## Alcance

**Dentro:**

- `resolveGameWindow()`: cuando el ejecutable de la lista viene como `unknown`, resolver por
  **clase de ventana**, usando el juego detectado para elegir la candidata.
- `gameCaptureSettings()`: acompañar esa resolución con la `priority` correcta, en vez del `2`
  hardcodeado de hoy.
- **Determinar los valores reales del enum `priority`** volcándolos de la propia propiedad-lista
  de libobs, no de memoria (ver Riesgos en el plan).
- Mismo tratamiento en el audio por proceso del juego (`processCaptureSettings`), que falla por
  la misma razón.
- Que los juegos que hoy enganchan sigan tomando **exactamente** el mismo camino, con test de
  regresión que lo fije.

**Fuera (explícito):**

- **Comprobación de salud del vídeo** (detectar `0x0` o lienzo negro y caer a otra fuente). Es la
  red de seguridad genérica para cualquier juego que no enganche, y necesita antes desacoplar
  `audioMode` del perfil de vídeo en `effectiveCapture` para no degradar el audio por app. Lleva
  su propio spec.
- **El bug del menú de LoL** (el perfil se decide por proceso, no por ventana). Anotado en el
  roadmap, rama aparte.
- Cablear `forceWindowCapture`, que existe en ajustes y UI pero no está conectado a nada.
- Reducir la frecuencia de reconstrucción del pipeline.

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] Con la lista de ventanas de la sesión medida de HD2, `resolveGameWindow` devuelve
      `HELLDIVERS™ 2:stingray_window:unknown` en vez de `null` (test con el volcado real).
- [ ] Un juego cuyo ejecutable **sí** aparece en la lista resuelve por ejecutable y produce los
      mismos settings que hoy, `priority` incluida (test de regresión).
- [ ] Con varias ventanas `unknown` de clases distintas no se engancha la equivocada: sin
      candidata inequívoca se prefiere no resolver (`null`) antes que apuntar a una ventana ajena.
- [ ] El valor de `priority` que se emite está respaldado por el volcado de la propiedad de
      libobs, y el comentario del código cita esa medición.
- [ ] **En máquina real con Helldivers 2**: el clip tiene imagen (sin frames negros según
      `blackdetect`, YAVG > 0) y la sonda reporta dimensiones distintas de `0x0`.
- [ ] **En máquina real con un juego que ya funcionaba**: sigue grabando con imagen, sin
      regresión.
- [ ] Las pistas de audio siguen separadas y con contenido donde toca (tono de referencia).
