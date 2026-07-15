# Spec — Alto del panel del editor avanzado persistente

**Tipo:** Feature (pequeña)
**Rama:** `feature/editor-panel-persistente`
**Fecha:** 2026-07-14

## Problema / Objetivo

En el editor avanzado, el divisor entre la previa y el panel de pistas/timeline se puede arrastrar para
subir o bajar el alto del panel (`panelH`). Pero es **estado local**: al cerrar la app, editar otro clip
o recargar, vuelve al valor por defecto (300 px). El objetivo es que esa preferencia **se recuerde entre
sesiones y entre clips**, como los ajustes.

## Alcance

**Dentro:**
- Persistir el alto del panel del editor avanzado en `localStorage` (clave `gameclip.editor.panelHeight`),
  igual que ya se guarda la sesión (`gameclip.session`). Es una preferencia de UI del renderer.
- Al abrir el editor (cualquier clip), el panel arranca con el alto guardado; al terminar de arrastrar el
  divisor, se guarda el nuevo alto.
- **Acotar** el valor guardado al rango válido al leerlo (mín. 140 px; máx. según el alto de la ventana),
  para que un valor viejo o una ventana más chica no dejen el panel fuera de pantalla.
- Tests unitarios de la lógica pura (clamp, load/save).

**Fuera (explícito):**
- No se persiste ninguna otra cosa del editor (zoom del timeline, volúmenes, reencuadre, etc.).
- No se toca el main, IPC ni el archivo de settings de captura: es solo `localStorage` del renderer.
- No se sincroniza entre máquinas (localStorage es local, como la sesión).

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] Arrastrar el divisor y cerrar/reabrir el editor (o editar otro clip) mantiene el alto elegido.
- [ ] Un alto guardado que no cabe en la ventana actual se acota al abrir (no queda fuera de pantalla).
- [ ] Sin valor guardado, arranca en el defecto de siempre (300 px).
- [ ] Type-check, lint y tests verdes, con tests unitarios de la lógica pura nueva.
