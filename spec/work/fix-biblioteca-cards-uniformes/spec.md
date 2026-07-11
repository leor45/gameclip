# Spec — Biblioteca: cards de tamaño uniforme con preview en `contain`

**Tipo:** Fix
**Rama:** `fix/biblioteca-cards-uniformes`
**Fecha:** 2026-07-11

## Problema / Objetivo

El owner reporta que en la Biblioteca las cards salen de tamaños distintos según la
resolución del clip (los verticales 1080x1920 estiran su card a lo alto) y la interfaz se
rompe. Todas las cards deben medir lo mismo y el preview mostrarse con `contain` dentro de
un marco fijo 16:9.

**Causa raíz:** `.clip-thumb` declara `aspect-ratio: 16/9`, pero su `<img>` (elemento
reemplazado con `width/height: 100%`) participa del sizing por contenido: en un contenedor
cuya altura no es definida, `height: 100%` resuelve a `auto` y la imagen impone su altura
intrínseca escalada (un thumbnail vertical hace la card altísima); el `aspect-ratio` del
contenedor cede ante ese contenido. Presente desde la Fase 4 (biblioteca), visible al
existir clips con resoluciones no 16:9 (los del bug del monitor vertical).

## Alcance

**Dentro:**
- `.clip-thumb img` posicionado absoluto (`inset: 0`) para sacarlo del flujo: la altura del
  botón queda definida solo por `aspect-ratio: 16/9` → todas las cards miden lo mismo.
- `object-fit: contain` (antes `cover`) para que el preview se vea completo, con bandas
  sobre el fondo oscuro existente, sin recortes ni deformación.
- Test de regresión en el renderer sobre las clases/estructura del thumb.

**Fuera (explícito):**
- Cambios de layout del grid (`.library-grid` no cambia).
- Miniaturas negras: son el contenido del video (bug de grabación, rama
  `fix/grabacion-negra-sin-audio`), no del CSS.
- El reproductor/editor (solo la card de la Biblioteca).

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] Con clips 16:9, 9:16 y 4:3 mezclados, todas las cards de la Biblioteca miden lo mismo
      (verificado en la app real con CDP/screenshot).
- [ ] El preview se muestra completo (`contain`) dentro del marco 16:9, sin deformar.
- [ ] Test de regresión verde y suite completa verde (typecheck · lint · tests).
