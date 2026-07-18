# Spec — El overlay de rendimiento sale en capturas externas

**Tipo:** Feature
**Rama:** `feature/overlay-proteccion-selectiva`
**Fecha:** 2026-07-18

> **Release:** entra en el **mismo release** que `feature/overlay-rendimiento` (Fase 19, ya en `main`)
> y que `feature/fps-solo-en-juego`. Las tres ramas son un solo entregable: el overlay de rendimiento
> no se publica hasta que las tres estén dentro. **Al preparar el release, las notas se arman con las
> tres.**

## Problema / Objetivo

El overlay de rendimiento se crea con `setContentProtection(true)`
(`WDA_EXCLUDEFROMCAPTURE`), que lo hace invisible para **toda** captura. Cumple el requisito de la
Fase 19 —que no salga en los clips ni en las grabaciones— pero se pasa de largo: tampoco sale cuando
el usuario comparte pantalla en Discord o hace un recorte de Windows, y ahí sí lo quiere ver.

Es el comportamiento de la NVIDIA App y de Steam: sus overlays se ven al compartir pantalla y en un
screenshot, pero no aparecen en los clips que graban ellos mismos.

**Objetivo:** que el overlay salga en capturas externas y siga sin salir en lo que graba GameClip.

## Cómo lo consiguen NVIDIA y Steam (y por qué nosotros no necesitamos copiarlo)

Sus overlays **no son ventanas**: se inyectan en la swapchain del juego enganchando
`IDXGISwapChain::Present` y dibujan en el back buffer. El capturador de juego copia ese buffer
**antes** de que el hook del overlay pinte encima — es una cuestión de orden en la cadena de hooks, y
por eso el overlay de Steam tampoco sale en un clip de NVIDIA.

Nosotros llegamos al mismo sitio por otro camino y sin inyectar nada: nuestro overlay es una ventana
de Electron aparte, así que **no está en el back buffer del juego** y el `game_capture` no puede verlo
de ninguna manera. La inyección en swapchain queda descartada: implica inyectar una DLL en el proceso
del juego —fricción con anticheats— a cambio de un comportamiento que ya tenemos gratis.

## Alcance

**Dentro:**

- Quitar la protección permanente y aplicarla **solo cuando el pipeline está capturando el monitor**,
  es decir con perfil `desktop` y algo capturando de verdad (búfer o grabación).
- Con perfil `game` la protección queda **siempre quitada**: el `game_capture` solo ve la swapchain
  del juego, así que los clips salen limpios igual y el overlay pasa a verse en capturas externas
  mientras juegas — que es el escenario principal.
- Quitar la protección al apagar la captura y al cerrar la app.

**Fuera (explícito):**

- Inyección en la swapchain del juego (ver arriba).
- Cualquier intento de excluir la ventana de un capturador concreto: `WDA_EXCLUDEFROMCAPTURE` es una
  propiedad **de la ventana**, no del capturador, y Windows no ofrece exclusión por sesión de WGC ni
  de duplicación de escritorio.
- Cambiar el modelo de búfer continuo para ganar más margen en el escritorio (ver limitación).
- Tocar el overlay de avisos (REC, clip guardado, aviso de juego): ese no lleva protección y no cambia.

## Limitación conocida y aceptada

El búfer de repetición corre **de forma continua**, no solo al pulsar grabar. Con los valores por
defecto (`bufferMode: 'always'` + `desktopRecordingEnabled: true`), estando en el escritorio sin juego
el perfil es `desktop` y el monitor se está capturando y codificando todo el rato. Ahí la protección
queda puesta de forma permanente y **una captura externa del escritorio seguirá sin ver el overlay**,
igual que hoy.

No hay margen que ganar en ese caso: si se desprotege mientras el búfer corre, el overlay entra en el
búfer y aparecería en cualquier clip que se salve después — rompiendo el requisito original.

Resumen de qué cambia de verdad:

| Situación | Hoy | Después |
|---|---|---|
| Jugando (perfil `game`) | invisible para todo | **visible en capturas externas**, ausente de los clips |
| Escritorio con `bufferMode: 'always'` (defecto) | invisible | igual: invisible |
| Escritorio con `bufferMode: 'game'` o sin grabación de escritorio | invisible | **visible en capturas externas** |

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] Con un juego detectado (perfil `game`), un recorte de Windows del área del overlay **sí** lo
      contiene.
- [ ] En ese mismo estado, un clip guardado con la hotkey **no** contiene el overlay.
- [ ] Con perfil `desktop` y el búfer corriendo, una grabación de escritorio **no** contiene el
      overlay.
- [ ] Con `bufferMode: 'game'` y sin juego, un recorte de Windows del escritorio **sí** contiene el
      overlay.
- [ ] Al cerrar la app o apagar la captura no queda ninguna ventana protegida de más.
- [ ] El overlay sigue visible en pantalla en todos los casos, y REC / clip guardado / aviso de juego
      siguen dibujándose **por encima** de él.
