# Plan — La copy no nombra a NVIDIA App

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Una sola cadena visible cambia. El barrido (`grep -i nvidia` sobre `src/`) ya está hecho y confirma
que **`Avanzado.tsx:296-299` es la única copy de usuario** que nombra a la NVIDIA App; el resto son
comentarios de código, el diagnóstico de PresentMon y los nombres de encoder, y los tres **se quedan**
por decisión del owner.

**La frase.** Hay que quitar la comparación **sin perder el dato útil**, que es *por qué* el centro no
se puede elegir — si desaparece, parece una limitación arbitraria y alguien la "arreglará" luego:

- Hoy: *«Con el overlay activo, los cambios se ven en pantalla al instante (el centro de la pantalla
  queda reservado al juego, como en NVIDIA App).»*
- Propuesta: *«Con el overlay activo, los cambios se ven en pantalla al instante. El centro de la
  pantalla no es una posición elegible: se deja libre para el juego.»*

Dos frases en vez de un paréntesis con dos ideas metidas dentro, y el porqué pasa a ser afirmación en
vez de nota al margen. Se pierde solo la comparación.

**El blindaje.** Un test comprueba que **la copy renderizada de Ajustes → Avanzado** no contiene
«NVIDIA App». Va sobre el DOM que ya monta `ajustes-perf.test.tsx`, no sobre los ficheros: buscar la
cadena en el código fallaría por los comentarios y el log, que se conservan **a propósito**. Así el
test protege la regla real («el usuario no la ve») y no una aproximación que obligaría a desactivarlo
la próxima vez que alguien escriba un comentario legítimo.

## Archivos / módulos afectados

- `src/renderer/views/ajustes/Avanzado.tsx` — la leyenda de posición (líneas 296-299). **Único cambio
  de producto.**
- `src/renderer/__tests__/ajustes-perf.test.tsx` — test de la regla sobre el DOM renderizado.
- `spec/constitution/roadmap.md` — al entregar (3 de 3 de la release 0.9.0).

**No se toca:** `src/shared/perf.ts` ni el comentario de `Avanzado.tsx:67` (notas de desarrollo),
`src/main/perf-metrics/presentmon.ts` (diagnóstico de sesiones ETW), `src/main/capture/obs.ts` ni el
fixture de `setup.ts` (`NVIDIA NVENC…` es el nombre real del encoder).

## Decisiones y alternativas consideradas

- **Test sobre el DOM renderizado y no sobre los ficheros fuente.** Un `grep` en el repo sería más
  amplio pero mediría lo que no es: daría rojo por los comentarios y el log que el owner decidió
  conservar, y acabaría desactivado o con excepciones que lo vacían de sentido.
- **Reescribir la frase entera en vez de recortar el paréntesis.** Dejar *«(el centro de la pantalla
  queda reservado al juego)»* colgando funcionaría, pero el paréntesis quedaba metiendo dos ideas
  distintas; separarlas hace la regla más clara ahora que no se apoya en una comparación conocida.
- **Solo Ajustes → Avanzado en el test.** Es donde vive la única cadena y donde volvería a colarse
  (es la pantalla del overlay). Barrer toda la UI en un test sería más lento sin cubrir un riesgo real.

## Riesgos

- **Bajo.** Es copy: no hay comportamiento que romper. El único riesgo de verdad sería que el test se
  escribiera contra el fichero en vez del DOM y diera rojo por lo que se conserva a propósito — que es
  justo lo que la decisión de arriba evita.
- El test de la leyenda de administrador (`ajustes-perf.test.tsx`) toca el mismo bloque de texto:
  hay que comprobar que sigue verde tras reescribir la frase de al lado.

---

**Estado:** ⏳ pendiente de aprobación
