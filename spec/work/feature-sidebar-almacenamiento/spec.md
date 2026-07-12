# Spec — Indicador de almacenamiento en el sidebar

**Tipo:** Feature
**Rama:** `feature/sidebar-almacenamiento`
**Fecha:** 2026-07-11

## Problema / Objetivo

Hoy hay que entrar a Ajustes → Almacenamiento para saber cuánto espacio ocupan los clips y cuánto
falta para el límite configurado (que dispara el auto-borrado de los más viejos). El sidebar debe
mostrarlo siempre, como en las apps de clips: un anillo de progreso con **usado / límite**.

## Alcance

**Dentro:**

- Indicador en el sidebar: anillo de progreso con el espacio usado por los clips del catálogo
  (clips + grabaciones) sobre el límite configurado (`storageLimitGb`), con las dos cifras
  (p. ej. `3 GB` sobre `10 GB`).
- Se refresca cuando cambia el catálogo (`library:changed`), que es cuando se guarda, borra o
  auto-borra un clip.
- Click en el indicador → navega a Ajustes → Almacenamiento.
- Sin límite configurado (`storageLimitGb = 0`): muestra el espacio usado y el anillo queda neutro
  (no hay porcentaje que representar).
- Al pasarse del límite, el anillo se completa y se marca en rojo (es la condición que dispara el
  auto-borrado, o el aviso de que está desactivado).

**Fuera (explícito):**

- Cambiar el límite desde el sidebar (se hace en Ajustes; el indicador solo lleva hasta ahí).
- Espacio libre del disco físico: eso ya lo muestra Ajustes → Almacenamiento con su desglose.
- Refresco por temporizador: el catálogo ya avisa de todo lo que mueve la aguja.

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] Con 3 GB de clips y límite de 10 GB, el sidebar muestra `3 GB` y `10 GB`, y el anillo al 30 %.
- [ ] Al guardar o borrar un clip, la cifra se actualiza sin recargar la app.
- [ ] Con el límite en 0 (sin límite) muestra solo el espacio usado, sin porcentaje.
- [ ] Usando más espacio que el límite, el anillo se ve al 100 % y en estado de alerta.
- [ ] Click en el indicador abre Ajustes → Almacenamiento.
- [ ] Gates verdes: `npm run typecheck`, `npm run lint`, `npm run test`.
