# Spec — Hotfix: el selector de duración de la barra se veía en blanco

**Tipo:** Hotfix
**Rama:** `hotfix/selector-duracion-barra`
**Fecha:** 2026-07-11

## Problema

El desplegable de duración del clip (`feature/barra-captura-nativa`) abre su lista con **fondo
blanco** y el texto casi ilegible: rompe el tema oscuro de la app.

## Causa raíz

El `<select>` de la píldora se estilizó con `background: transparent`. El popup nativo de Windows no
se pinta con el CSS de la página: **hereda el color de fondo del propio `select`**, y un fondo
transparente le resuelve a blanco. Los demás desplegables de la app (biblioteca, ajustes) no tienen
el problema porque llevan un fondo sólido (`var(--bg-panel)` / `var(--bg)`).

`color-scheme: dark` ya está en `:root` y no alcanza: solo cambia los controles por defecto, no un
fondo declarado explícitamente.

## Arreglo

Fondo sólido en el `select` (`var(--bg-panel)`, como el resto de la app) y las `option` declaradas
con su fondo y color, que es lo que Chromium usa para pintar las filas del popup.

## Criterios de aceptación

- [x] El desplegable de duración se abre con el fondo oscuro de la app y el texto legible.
- [x] Sigue mostrando y guardando la duración (los tests de la barra siguen verdes).
- [x] Gates verdes: `npm run typecheck`, `npm run lint`, `npm run test`.
- [ ] Comprobación visual del owner.

## Nota

Sin test automatizado: es color en un popup que el navegador dibuja fuera del DOM (jsdom no lo
renderiza y ni siquiera existe como nodo). Lo que sí está cubierto por los tests de la barra es que
el control siga funcionando.
