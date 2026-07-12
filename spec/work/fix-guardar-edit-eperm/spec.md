# Spec — Fix: "Guardar edit" falla con EPERM al reemplazar el clip

**Tipo:** Fix
**Rama:** `fix/guardar-edit-eperm`
**Fecha:** 2026-07-11

## Problema

Guardar el edit de audio de un clip falla:

```
EPERM: operation not permitted, rename
'D:\…\acblackflag\.gameclip-edit-41936-1783826257336.mp4'
-> 'D:\…\acblackflag\acblackflag 2026.07.11 - 22.14.10.65.mp4'
```

El clip queda intacto (el temporal se borra), pero el edit no se aplica.

## Causa raíz

**Windows no deja renombrar sobre un archivo abierto**, y el destino —el clip— lo tiene abierto **la
propia app**: el `<video>` del editor lo está reproduciendo por el protocolo `gameclip-media://`
(registrado con `stream: true`, que sirve el archivo con un handle vivo mientras el reproductor lo
tenga cargado).

Reproducido aislado con `fs`: renombrar sobre un destino cerrado funciona; con un handle de solo
lectura abierto sobre el destino da **EPERM**; al cerrar el handle, el mismo rename funciona.

Explica que fuera **intermitente** (antes funcionó al menos una vez): si el clip es chico y Chromium
ya terminó de bufferearlo, puede haber soltado el handle; con un clip más grande —o todavía
buffereando— el handle sigue abierto y el rename falla.

**No es que "los de escritorio funcionen"**: los clips de escritorio no tienen pistas por rol, así
que para ellos el botón "Guardar edit" está deshabilitado y nunca llegan a este camino. El bug
afecta a **todo clip que sí se pueda editar**.

## Alcance

**Dentro:**

- El editor **suelta el archivo** antes de guardar: pausa el `<video>`, le quita el `src` y lo
  recarga (`load()`) — que es lo que cierra el handle de Chromium —, y al terminar (con éxito o con
  error) vuelve a cargar el clip con cache-busting.
- El main **reintenta el rename** ante EPERM/EACCES/EBUSY con backoff corto: soltar el handle es
  asíncrono, y el reintento cubre además bloqueos ajenos y transitorios (indexador de Windows,
  antivirus).
- Si el bloqueo persiste tras los reintentos, el mensaje deja de ser un EPERM crudo y dice en
  español que el archivo está en uso.

**Fuera (explícito):**

- Cambiar el protocolo de medios para no mantener handles abiertos.
- Aplicar la misma protección a la exportación (escribe en un archivo nuevo: no reemplaza nada).

## Criterios de aceptación

- [ ] Test de regresión (rojo antes del fix): un rename que da EPERM y a la siguiente funciona no
      rompe el edit.
- [ ] Si el bloqueo persiste, el edit falla con un mensaje en español y el clip queda intacto (el
      temporal se borra).
- [ ] El editor suelta el `<video>` antes de invocar el guardado y lo vuelve a cargar después.
- [ ] Guardar el edit de un clip de juego funciona con el reproductor cargado.
- [ ] Gates verdes: `npm run typecheck`, `npm run lint`, `npm run test`.
