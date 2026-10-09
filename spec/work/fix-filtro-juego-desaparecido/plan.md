# Plan — El filtro por juego se queda pegado cuando el juego desaparece del catálogo

> **Este plan es un contrato.** Aprobado con el resto de la tanda C («sí, adelante»).

## Enfoque

1. `src/renderer/views/Biblioteca.tsx`, en `cargar`: si `juego` no está vacío, no es el centinela de
   Escritorio y no figura en `listaJuegos`, `setJuego('')` y salir; el cambio de `juego` recrea
   `cargar` y el efecto recarga sin filtro.

## Archivos / módulos afectados

- `src/renderer/views/Biblioteca.tsx` (+ `src/renderer/__tests__/biblioteca.test.tsx`)
- `spec/constitution/roadmap.md`

## Decisiones y alternativas consideradas

- **Soltar el filtro** frente a pintar una opción temporal con el juego desaparecido: no quedan clips
  de ese juego, así que seguir filtrando solo enseña una lista vacía.

## Riesgos

- Ninguno relevante: una recarga extra solo en ese caso.

---

**Estado:** ✅ aprobado el 2026-10-09
