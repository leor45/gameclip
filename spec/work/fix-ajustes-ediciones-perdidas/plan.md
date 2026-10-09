# Plan — Ediciones de Ajustes que se pierden (durante un guardado y al renombrar con Enter)

> **Este plan es un contrato.** Aprobado con el resto de la tanda C («sí, adelante»).

## Enfoque

1. `src/renderer/views/ajustes/useCaptureSettings.ts`: `editadas` pasa de `Set` a
   `Map<clave, nº de ediciones>`. `save()` guarda una foto del mapa; al volver, borra solo las claves
   cuyo contador no cambió y fusiona `applied` con el valor local de las que siguen pendientes (la
   misma regla que ya aplica el listener de `settings:changed`). `saved` = no queda nada pendiente.
2. `src/renderer/views/ajustes/Grabacion.tsx`: `onKeyDown` en «Renombrar…»: con Enter,
   `preventDefault()` y `renombrarJuego(...)`.

## Archivos / módulos afectados

- `src/renderer/views/ajustes/useCaptureSettings.ts` (+ `src/renderer/__tests__/use-capture-settings.test.tsx`)
- `src/renderer/views/ajustes/Grabacion.tsx` (+ `src/renderer/__tests__/grabacion.test.tsx`)
- `spec/constitution/roadmap.md`

## Decisiones y alternativas consideradas

- **Contador de ediciones** frente a comparar el valor enviado con el actual: los ajustes llevan arrays
  y objetos (juegos manuales, apps de audio) que se comparan por referencia; el contador no depende de
  eso.
- **Enter confirma, no guarda:** hacer que Enter guarde exigiría esperar al render con el nombre nuevo;
  confirmar el nombre es lo que hace el blur y lo que el usuario espera de un campo de renombrar.
- **Input controlado** descartado: `renombrarJuego` recorta espacios y, controlado, borraría el espacio
  al escribir «Mi juego».

## Riesgos

- Ninguno relevante: sin ediciones durante la espera el comportamiento es el de siempre.

---

**Estado:** ✅ aprobado el 2026-10-09
