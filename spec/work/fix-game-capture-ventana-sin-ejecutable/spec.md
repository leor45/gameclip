# Spec — El game capture no se re-apunta cuando la ventana del juego aparece tarde

**Tipo:** Fix
**Rama:** `fix/game-capture-ventana-sin-ejecutable`
**Fecha:** 2026-07-19

> **El nombre de la rama es histórico.** Nació investigando por qué Helldivers 2 salía en negro, con
> la hipótesis de que el problema era el matcher de ventanas. La investigación demostró que la causa
> raíz era **otra** (ver abajo) y que el matcher no tenía nada que arreglar. Lo que esta rama entrega
> es el re-apuntado, que sí resultó necesario y está verificado.

## Problema / Objetivo

El pipeline de captura se construye cuando el **detector ve el proceso** del juego. Pero la
**ventana** puede no existir todavía en ese instante: en Helldivers 2 se midieron **12 segundos** de
diferencia (el anti-cheat corre primero).

Como el game capture se apuntaba **una sola vez**, al construir el pipeline, se quedaba en
`any_fullscreen` durante **toda la sesión** aunque la ventana apareciera después. Nadie volvía a
mirar.

Medido con la sonda el 2026-07-19:

| Hora (UTC) | Evento |
|---|---|
| 07:20:47 | perfil → `game`; la ventana **aún no existe** → `any_fullscreen` (decisión correcta) |
| 07:20:59 | el re-apuntado encuentra la ventana y la aplica (`capture_mode: window`) |
| 07:21:03 | `dimensiones game_capture: 2560x1440` — **el hook engancha** |

Sin el bucle, el estado de las 07:20:47 se habría quedado congelado hasta cerrar el juego.

## La causa raíz de los clips negros de HD2 NO era esta

Conviene dejarlo escrito porque costó una noche entera y tres hipótesis equivocadas.

**Los clips negros de Helldivers 2 los causaba que `obs64.exe` no está firmado.** nProtect GameGuard
deniega el acceso al proceso del juego a binarios sin firma Authenticode, así que libobs no podía
resolver el proceso dueño de la ventana (`unknown` en la lista) ni inyectar el hook.

Comprobado firmando `obs64.exe` con un certificado de prueba: con la firma puesta, misma máquina y
mismo código, libobs lista `HELLDIVERS™ 2:stingray_window:helldivers2.exe`, el hook engancha
(`d3d12 shared texture capture successful`) y el clip sale con imagen y con **la pista de audio del
juego a −28 dB**.

Detalle completo, evidencias y descartes en `spec/constitution/roadmap.md`.

## Alcance

**Dentro:**

- Bucle acotado de re-apuntado a la ventana del juego mientras el perfil sea `game` y la ventana no
  se haya resuelto.
- El valor de `priority` que se emite pasa a estar respaldado por un volcado de la propiedad-lista
  de libobs, no por memoria (`0 = clase · 1 = título · 2 = ejecutable`; la anotación previa del
  roadmap tenía el 0 y el 1 invertidos).

**Fuera (explícito):**

- **Firmar los binarios.** Es la causa raíz de HD2 y no es código: va por su propia vía (certificado
  de firma, o que Streamlabs firme su `obs64.exe` upstream).
- **Emparejar ventanas con el ejecutable en `unknown`.** Se llegó a implementar y **se retiró**: no
  arregla nada. Sin firma resolvía la ventana y el hook fallaba igual; con firma no se activa porque
  el ejecutable ya resuelve. Era una heurística con riesgo de falso positivo y cero valor demostrado.
- **Comprobación de salud del vídeo** (detectar `0x0` y avisar en la UI en vez de guardar clips
  negros en silencio). Muy deseable a la luz de todo esto, pero lleva su propio spec.
- El bug del menú de LoL y cablear `forceWindowCapture`.

## Criterios de aceptación

- [ ] Con el perfil de juego y la ventana sin resolver, se reintenta; en cuanto resuelve, para.
- [ ] Hay un tope de intentos: un juego que nunca resuelve deja de sondearse y se queda en
      `any_fullscreen`, el comportamiento previo.
- [ ] Fuera del perfil de juego no se reintenta nada.
- [ ] Cerrar el juego corta los reintentos en curso.
- [ ] Un fallo del backend al reintentar no tumba el manager ni el bucle.
- [ ] Un juego que ya enganchaba sigue haciéndolo, con los mismos settings de siempre.
- [ ] **En máquina real**: el re-apuntado aplica la ventana y el hook engancha (verificado con
      Helldivers 2 y el binario firmado).
