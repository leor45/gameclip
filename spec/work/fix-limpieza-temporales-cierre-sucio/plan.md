# Plan — La limpieza de temporales no se recupera de un cierre sucio

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Dos cambios pequeños, uno por causa raíz.

### 1. Limpiar también al arrancar

`limpiarTemporales()` pasa a correr **al arrancar** además de al cerrar (`will-quit`). El arranque es la
única red que atrapa **todos** los cierres sucios: apagón, cuelgue, `taskkill`, o un apagado de Windows
que se quedó sin tiempo. Es idempotente y ya es best-effort, así que llamarla dos veces no cuesta nada.

### 2. Registrar el staging propio mientras aún es reconocible

El agujero no es de detección, es de **momento**: cuando la app arranca, su staging **todavía tiene el
marcador** (`7z-out\GameClip.exe`, recién extraído); es *después*, cuando el launcher lo limpia a medias
al morir, cuando degrada a un `app-64.7z` genérico e indistinguible del de cualquier otra app de
electron-builder.

Así que se reclama **en el momento en que no hay duda**: al arrancar se localiza el staging de esta
ejecución (el `nsXXXX.tmp` que tiene el marcador y **no** es de una ejecución anterior) y se anota su ruta
en `userData/portable-temp.json`. En el arranque siguiente esa ruta se borra sin mirar qué quedó dentro:
ya sabemos que era nuestra.

Con esto el ciclo queda:

| | Qué pasa |
|---|---|
| Arranque 1 | Limpia lo registrado (nada aún). Anota su staging `nsAAAA.tmp`. |
| Apagón | Quedan `nsAAAA.tmp` y el payload. Nadie limpió. |
| Arranque 2 | Ve `nsAAAA.tmp` registrado, comprueba que no es el suyo de ahora, **lo borra**. Anota `nsBBBB.tmp`. |

El consumo deja de crecer: como mucho queda **un** staging, el del último apagón, y solo hasta el
siguiente arranque. El payload no se multiplica (lleva el nombre de la versión, se reutiliza).

Las tres reglas de seguridad que ya gobiernan el módulo siguen intactas, y el registro no las relaja:
**solo lo nuestro** (una ruta registrada la escribimos nosotros, con el marcador delante), **solo lo de
ejecuciones anteriores** (el staging en curso se excluye explícitamente), y **nunca a medias** (se renombra
antes de borrar; si algo está abierto, falla sin destruir nada).

## Archivos / módulos afectados

- `src/main/temp-cleanup.ts`
  - `stagingsActuales(entorno)` — el staging de ESTA ejecución (marcador + no es anterior).
  - `carpetasHuerfanas(entorno, registradas)` — a las tres reglas de siempre se suman las rutas
    registradas que existan y no sean la actual.
  - `limpiarTemporales(entorno, registro?)` — limpia y deja anotado el staging en curso.
  - `RegistroStaging` + `registroEnDisco(fichero)` — persistencia (inyectable, para testear sin disco).
- `src/main/index.ts` — la limpieza se llama también al arrancar, con el registro
  (`userData/portable-temp.json`). Sigue siendo solo `if (app.isPackaged)`.
- `src/main/__tests__/temp-cleanup.test.ts` — regresión + casos nuevos.

## Decisiones y alternativas consideradas

- **Registrar la ruta al arrancar**, en vez de reclamar cualquier `nsXXXX.tmp` que tenga `app-64.7z`. Lo
  segundo se llevaría el staging de **otras** apps de electron-builder: es exactamente el riesgo que la
  regla 1 del módulo existe para evitar.
- **Limpiar al arrancar**, en vez de reordenar el `teardown` para que la limpieza vaya antes que el apagado
  de libobs. Reordenar ayudaría solo en el apagado ordenado de Windows; no hace nada ante un corte de luz
  o un cuelgue. El arranque los cubre todos.
- **Se mantiene la limpieza al cerrar.** Recupera el espacio en el acto en el caso normal, sin esperar al
  arranque siguiente.
- **El registro guarda una lista, no una sola ruta.** Si un arranque muere antes de limpiar, la ruta del
  anterior no debe perderse; se acumulan hasta que se borran de verdad.

## Riesgos

- **Borrar un staging ajeno**: descartado por construcción — solo se borran rutas que la app anotó tras
  ver su propio marcador. Cubierto con un test que mete un `nsAJENA.tmp` con `app-64.7z` y comprueba que
  sobrevive.
- **Borrar el staging en curso** (el launcher lo tiene abierto): se excluye explícitamente, y la regla del
  renombrado-antes-de-borrar lo protegería igualmente.
- **Registro corrupto o ilegible**: se trata como vacío. Un fallo del registro no puede impedir el arranque.
- **Coste en el arranque**: es un `readdir` del temporal más, en el peor caso, borrar una carpeta de la
  ejecución anterior. No bloquea la ventana (va tras `whenReady`, como el resto).

---

**Estado:** ✅ aprobado el 2026-07-12 (el owner aprobó el enfoque en la conversación: "si, dale")
