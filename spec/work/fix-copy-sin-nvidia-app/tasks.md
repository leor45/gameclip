# Tasks — La copy no nombra a NVIDIA App

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Test de regresión primero (rojo → verde)

- [x] R1. La copy renderizada de Ajustes → Avanzado no contiene «NVIDIA App».
      *(Rojo confirmado: el volcado del DOM mostraba la cadena en la leyenda de posición.)*

## Implementación

- [x] 1. Reescribir la leyenda de posición en `Avanzado.tsx` quitando la comparación y **conservando**
      el porqué del centro reservado.
- [x] 2. Comprobar que no queda ninguna otra cadena visible (barrido `grep -i nvidia` sobre `src/`).

## Tests unitarios (obligatorios)

Camino feliz **y** casos borde.

- [x] La copy de Ajustes → Avanzado no contiene «NVIDIA App» — sobre el **DOM renderizado**, no sobre
      los ficheros: en el código se conservan a propósito los comentarios y el diagnóstico de
      PresentMon, así que un test contra el fuente daría rojo por lo que se quiere mantener.
- [x] La leyenda sigue explicando **por qué** el centro no es una posición elegible.
- [x] La leyenda de administrador / PawnIO, que vive en el mismo bloque, sigue verde.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — **856** (854 de partida, +2)
- [x] Se conservan intactos, por decisión del owner: comentarios de `perf.ts` y `Avanzado.tsx`,
      diagnóstico de `presentmon.ts` y los nombres de encoder `NVIDIA NVENC…`.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado — **3 de 3: la release 0.9.0 queda lista**
