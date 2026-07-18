# Spec — FPS solo cuando hay un juego, «—» en el escritorio

**Tipo:** Feature
**Rama:** `feature/fps-solo-en-juego`
**Fecha:** 2026-07-18

> **Release:** entra en el **mismo release** que `feature/overlay-rendimiento` (Fase 19, ya en `main`)
> y que `feature/overlay-proteccion-selectiva`. Las tres ramas son un solo entregable: el overlay de
> rendimiento no se publica hasta que las tres estén dentro. **Al preparar el release, las notas se
> arman con las tres.**

## Problema / Objetivo

El contador de FPS del overlay de rendimiento (Fase 19) mide **cualquier** proceso que presente. En
el escritorio eso significa que marca los FPS de Discord, el navegador o el editor de código, que no
es información útil y confunde: el usuario ve un número donde esperaba nada.

La Fase 19 ya mitigó lo peor —el contador se quedaba **pegado** a una app de escritorio incluso
jugando (marcaba 52 fps, que era Discord, con el juego a 129)—, pero el síntoma de fondo sigue: sin
juego, el overlay inventa una cifra.

**Objetivo:** que los FPS se muestren cuando hay un juego y muestren «—» en el escritorio, **sin
depender de la lista de juegos detectados** — el requisito original de la Fase 19 era que funcionaran
con emuladores y cualquier cosa que presente, y eso no se toca.

Referencia de comportamiento: la NVIDIA App apaga su contador de FPS en el escritorio mientras las
demás métricas siguen vivas.

## Alcance

**Dentro:**

- Un proceso **califica** como juego cuando presenta por la ruta directa a hardware — los modos
  `Hardware: …` y `Hardware Composed: Independent Flip` de PresentMon, que son los de pantalla
  completa y ventana sin bordes. Las apps de escritorio presentan por el compositor de Windows
  (`Composed: …`) y nunca califican.
- Calificar decide **solo el enganche**, no cada lectura: una vez enganchado, el proceso conserva el
  contador mientras siga presentando —segundo plano incluido— aunque DWM lo degrade un momento a un
  modo compuesto. Es el enganche pegajoso que ya existe, con una puerta de entrada delante.
- Segunda vía de calificación: **ser el juego que la app ya tiene detectado** (automático o manual).
  No es un requisito que apague nada — es un atajo que solo puede encender el contador, y cubre el
  emulador que corre en ventana normal.
- Sin ningún proceso calificado → FPS en «—». **El resto de métricas siguen funcionando** (GPU, CPU,
  VRAM, RAM): apagar los FPS no apaga el overlay.

**Fuera (explícito):**

- Ningún ajuste nuevo en la UI. Se evaluó un interruptor tipo «medir también apps en ventana» y el
  owner lo descartó: un ajuste que solo se entiende explicando un caso de borde es deuda de interfaz,
  y empeora el comportamiento de quien lo activa sin saber qué activó.
- Heurísticas para adivinar un juego en ventana (primer plano, ritmo sostenido). Ver el plan: ninguna
  distingue un emulador en ventana de Discord en ventana, porque desde fuera **son el mismo caso**.
- Tocar la selección entre varios procesos calificados: sigue el `MARGEN_CAMBIO` de la Fase 19.
- Cambiar de qué fuente salen las demás métricas.

## Limitación conocida y aceptada

Un juego o emulador que corra **en ventana normal** (ni pantalla completa ni sin bordes) **y** que
además no esté en la lista de juegos mostrará «—». Se resuelve añadiéndolo a mano, que es lo que ya
hay que hacer para que la app lo clipee de todos modos.

No hay forma limpia de cerrarlo: cualquier señal que encienda los FPS de un emulador en ventana
enciende también los de Discord en ventana. Por eso NVIDIA y Steam mantienen listas de aplicaciones.

## Hallazgo de la E2E (2026-07-18) — medido, no supuesto

La verificación en la máquina del owner dejó un dato que **contradice la premisa del plan** y conviene
que quede escrito, porque cualquiera que retome esto lo va a asumir mal otra vez.

Capturas de PresentMon 2.5.1 (sesión aparte, 8–10 s cada una):

| Proceso | Qué es | Modo de presentación |
|---|---|---|
| `dwm.exe` | compositor (en denylist) | **`Hardware: Legacy Flip`** |
| `re9demo.exe` | juego AAA, pantalla completa | `Composed: Flip` (2127/2127) |
| `eden.exe` | emulador, pantalla completa (F11) | `Composed: Flip` (533/533) |
| `Code.exe`, `obs64.exe`, Discord, Opera | apps de escritorio | `Composed: Flip` |

**En Windows 11 moderno ninguna aplicación llega a modo hardware: solo DWM.** El *Independent Flip*
casi no ocurre — los juegos usan ventana sin bordes por defecto y con HAGS, varios monitores o
cualquier overlay topmost el compositor se queda al mando. La premisa «juego = presenta por
hardware» describe a un Windows anterior.

Consecuencia práctica: **la vía del modo de presentación no dispara nunca en esta máquina y todo el
trabajo lo hace la vía de detección.** Se comprobó que no era culpa del overlay propio (misma
medición con el overlay de GameClip apagado: idéntico resultado).

**Aun así la vía del modo se conserva**, porque es **puramente aditiva**: `califica()` acepta
cualquiera de las dos vías y la marca nunca se apaga, así que solo puede **encender** FPS, jamás
apagarlos. Donde el *Independent Flip* sí ocurra (pantalla completa exclusiva, MPO activo, Windows
más viejo) cubre juegos no detectados; donde no ocurra, no estorba.

> Ojo al contar las fuentes de detección: son **tres** — la lista curada (`src/shared/games.ts`),
> las altas manuales (`customGames`) y el **índice de launchers** (`games-index.json`), que es la que
> más juegos aporta. Durante esta E2E se dio una falsa alarma («Resident Evil mostraría —») por
> revisar solo las dos primeras.

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] En el escritorio, sin juego y con Discord/navegador/editor abiertos y presentando, el overlay
      muestra **«—»** en FPS.
- [ ] Las demás métricas marcadas (GPU, VRAM, CPU, RAM…) **siguen mostrando valores** en ese estado.
- [ ] Un juego en **pantalla completa o sin bordes** muestra sus FPS aunque **no** esté en la lista de
      juegos detectados.
- [ ] Un juego ya enganchado **conserva** su contador al pasar a segundo plano (alt+tab), sin caer a
      «—» ni saltar a la app que quedó delante.
- [ ] Un juego **detectado** (automático o manual) muestra sus FPS aunque corra en ventana normal.
- [ ] Los frames generados (DLSS/FSR FG) se siguen contando: el contador coincide con el número de
      Steam, como en la Fase 19.
