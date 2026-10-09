# Spec — El filtro por juego se queda pegado cuando el juego desaparece del catálogo

**Tipo:** Fix
**Rama:** `fix/filtro-juego-desaparecido`
**Fecha:** 2026-10-09

## Problema / Objetivo

Auditoría bug-hunter C, C4-BUG-3 (Low). En la Biblioteca, si filtras por un juego y borras su último
clip, la lista dice «Sin resultados con estos filtros», el desplegable muestra «Todos los juegos» y
elegir «Todos los juegos» no hace nada: el filtro sigue puesto.

**Causa raíz:** `games()` deja de devolver ese juego, así que el `<select>` controlado tiene un `value`
sin opción; React marca la primera («Todos los juegos») y elegirla no dispara `change` porque ya es la
seleccionada. El estado `juego` sigue con el nombre viejo.

## Alcance

**Dentro:**
- `Biblioteca.tsx`: tras cargar, si el juego filtrado (que no sea «Escritorio») ya no está en la lista
  de juegos, soltar el filtro y recargar.
- Test de regresión.

**Fuera (explícito):**
- Cambiar cómo se calcula la lista de juegos.

## Criterios de aceptación

- [ ] Filtrando por un juego que desaparece del catálogo, la vista vuelve a «Todos los juegos» y
      consulta sin filtro de juego.
- [ ] Suite verde.
