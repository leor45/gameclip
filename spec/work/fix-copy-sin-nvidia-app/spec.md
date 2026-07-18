# Spec — La copy no nombra a NVIDIA App

**Tipo:** Fix
**Rama:** `fix/copy-sin-nvidia-app`
**Fecha:** 2026-07-18
**Release:** 0.9.0, junto a `fix/sensores-pawnio` y `fix/sensores-cpu-solo-si-hace-falta`

## Problema / Objetivo

La NVIDIA App se usó como **referencia de diseño durante el desarrollo** del overlay de rendimiento
(las 8 posiciones con nombre, el centro reservado al juego, el preview en vivo). Eso es una nota
interna: **el producto no debe nombrarla**. Hoy se le escapa al usuario en Ajustes → Avanzado:

> Con el overlay activo, los cambios se ven en pantalla al instante (el centro de la pantalla queda
> reservado al juego, **como en NVIDIA App**).

**Causa raíz:** una decisión de diseño anotada como comparación se coló tal cual en la copy visible
(`src/renderer/views/ajustes/Avanzado.tsx:296-299`, de la Fase 19). Instrucción del owner (2026-07-18):
*«no hay que referenciar nada de la NVIDIA App en esta app, eso te lo dije para que tú lo tengas como
referencia en el desarrollo, no colocarlo explícitamente»*.

## Alcance

**Dentro:**

- Quitar «como en NVIDIA App» de la leyenda de posición, **reescribiendo la frase** para que siga
  explicando por qué el centro no es una posición elegible (el dato útil es ese, no con quién se
  compara).
- **Barrido completo** de la copy visible en busca de otras referencias a NVIDIA App, para que esto no
  se arregle solo en el sitio que se vio.
- Test que fije la regla: la copy de Ajustes no contiene «NVIDIA App».

**Fuera (explícito):**

- **`NVIDIA NVENC…`** en los nombres de encoder (`src/main/capture/obs.ts:161-164`) y su fixture: es
  el **nombre real del encoder de hardware**, no una referencia a la NVIDIA App. Quitarlo dejaría al
  usuario sin saber qué está eligiendo.
- Rediseñar el selector de posición o cambiar comportamiento: esto es **solo copy**.

## Decidido por el owner (2026-07-18): **solo sale lo visible**

> *«Déjalos, solo quita lo visible; los comentarios en código solo evidencian que pueden pelear por
> las sesiones ETW, así que está bien.»*

El barrido encuentra tres clases de referencia y **solo la primera se toca**:

1. **Copy visible — ✂️ FUERA.** `Avanzado.tsx:296-299` (la leyenda que motivó el spec). Es la única
   cadena que ve el usuario: el barrido no encontró ninguna otra.
2. **Comentarios de código — ✅ SE QUEDAN.** `src/shared/perf.ts:1, 76, 114` y `Avanzado.tsx:67`
   («estilo NVIDIA App», «las 8 posiciones con nombre (como NVIDIA App)»). Son notas de desarrollo,
   que es exactamente lo que el owner dijo que la referencia debía ser, y documentan *por qué* el
   centro está excluido: perder ese porqué invitaría a "arreglarlo" más adelante.
3. **Diagnóstico en el log — ✅ SE QUEDA.** `src/main/perf-metrics/presentmon.ts:33, 284`: nombra a la
   NVIDIA App (junto al overlay de Steam) como capturador que **compite por las sesiones ETW** y puede
   dejar los FPS sin datos. No es una referencia de diseño sino resolución de problemas, y quitarla
   haría el mensaje menos útil justo cuando alguien lo necesita.

**Consecuencia para el test:** la regla que se blinda es «**la copy visible** no nombra a la NVIDIA
App», no «la cadena no aparece en el repo». Un test que buscara la cadena en todo el código fallaría
por los comentarios y el log, que se quedan a propósito.

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] La leyenda de posición ya no dice «como en NVIDIA App» y **sigue explicando** que el centro de
      la pantalla queda reservado al juego.
- [ ] Ninguna cadena visible en la UI contiene «NVIDIA App».
- [ ] Los nombres de encoder `NVIDIA NVENC H.264` / `HEVC` **siguen intactos**.
- [ ] Test de regresión que falla si vuelve a colarse «NVIDIA App» en la copy de Ajustes.
- [ ] Gates verdes: type-check · lint · tests.
