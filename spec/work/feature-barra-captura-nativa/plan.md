# Plan — Barra de captura: indicador de juego y duración del clip

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Es una tarea de renderer: los datos ya existen y viajan solos.

- **Juego activo:** `CaptureStatus.detectedGame` (push por `capture:status-changed`).
- **¿Manual o de la lista curada?** No hace falta un campo nuevo en el estado: `customGames` está en
  los ajustes, y el nombre visible de un juego manual **es su ejecutable sin `.exe`**
  (`findRunningGamesMatch`, `games.ts`). El renderer compara el juego activo contra esa lista con un
  helper puro en `@shared/games` (`isManualGame(name, customGames)`), y así la marca "manual" no
  depende de que el main recuerde etiquetarla.
- **Duración del clip:** `replaySeconds` de los ajustes. El control la escribe con
  `capture.setSettings({ replaySeconds })` y se re-hidrata con **`settings:changed`**, el evento que
  agregamos hace un rato — por eso cambiarla en Ajustes actualiza la barra al vuelo, sin sondeos.

Presentación: la barra pasa a ser una fila de **píldoras** (mismo lenguaje visual que el resto de la
app):

```
[🎮 Terraria · manual]   [● Buffer activo]        [Clip: 1 m ▾]  [Guardar clip] [Grabar]
[🎮 Esperando juego]     [● REC 00:42]            [Clip: 1 m ▾]  [Guardar clip] [Detener]
```

El selector de duración ofrece presets (30 s · 1 m · 2 m · 3 m · 5 m) dentro de los límites que ya
valida el dominio (`REPLAY_SECONDS_MIN/MAX` = 10 s / 300 s), así que ningún valor del control puede
ser rechazado por la normalización.

## Archivos / módulos afectados

- `src/shared/games.ts` — `isManualGame(name, customGames)` (puro, con test).
- `src/renderer/components/CaptureBar.tsx` — píldoras, indicador de juego (+ marca manual), selector
  de duración suscrito a `settings:changed`, botones existentes reestilados.
- `src/renderer/styles.css` — estilos de las píldoras de la barra.
- Tests: `capture-ui.test.tsx` — muestra "Esperando juego" sin juego; el nombre con juego; la marca
  "manual" solo si está en `customGames`; el selector guarda `replaySeconds`; un `settings:changed`
  externo actualiza el control; los botones siguen respondiendo al estado.

## Decisiones y alternativas consideradas

- **Deducir "manual" en el renderer** desde `customGames` en vez de añadir un flag al
  `CaptureStatus`: el estado ya viaja con el nombre y la lista ya viaja con los ajustes; meter un
  campo nuevo obligaría a mantenerlo sincronizado en el main sin ganar nada.
- **Presets de duración, no un input libre**: la barra es para decidir rápido; el valor fino ya está
  en Ajustes → General, y ambos escriben el mismo `replaySeconds`.
- **No tocar el main**: cero canales nuevos. Todo lo que la barra necesita ya se empuja.

## Riesgos

- **Un juego curado que se llame igual que un ejecutable manual** se marcaría como manual. Es
  inofensivo (la marca es informativa) y solo puede pasar si el usuario añade a mano un `.exe` que
  ya está en la lista curada.
- **Cambiar `replaySeconds` reconstruye el pipeline** (lo hace hoy también desde Ajustes): el buffer
  se reinicia y pierde su contenido. Se avisa en el control con un texto discreto.

---

**Estado:** ✅ aprobado por el owner (2026-07-11) e implementado
