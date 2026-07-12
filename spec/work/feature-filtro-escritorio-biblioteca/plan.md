# Plan — Filtro "Escritorio" en la biblioteca

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

"Sin juego" **no es un juego**: `ClipsQuery.game` es un nombre exacto y `library.games()` solo
devuelve juegos no nulos, así que "Escritorio" no puede colarse como un valor más de esa lista (y
además chocaría con un juego que se llamara así de verdad). Se modela como un criterio propio:

- `ClipsQuery.withoutGame?: boolean` en el dominio compartido. El repositorio añade `game IS NULL`
  al `WHERE` cuando está activo (excluyente con `game`, que se ignora si ambos vinieran juntos).
- `sanitizeQuery` (IPC) lo valida como los demás campos.
- En el desplegable, la opción usa un valor centinela (`__escritorio__`, constante compartida) que
  el renderer traduce a `withoutGame: true`. El centinela nunca viaja al catálogo: lo que cruza el
  IPC es el criterio, no una cadena mágica que el main tenga que interpretar.

La etiqueta visible es "Escritorio" (español, como el resto de la UI), aunque la carpeta en disco se
llame `Desktop/` — el criterio es el juego del catálogo, no la carpeta.

## Archivos / módulos afectados

- `src/shared/library.ts` — `ClipsQuery.withoutGame` + constante del centinela del desplegable.
- `src/main/library/clips-repository.ts` — `game IS NULL` en `list()`.
- `src/main/ipc.ts` — `sanitizeQuery` acepta el criterio nuevo.
- `src/renderer/views/Biblioteca.tsx` — opción "Escritorio" y traducción del centinela.
- Tests: `clips-repository.test.ts` (solo clips sin juego; no se mezcla con el filtro por juego;
  un juego llamado "Escritorio" no interfiere), `shared/__tests__/library.test.ts` o
  `ipc.test.ts` (normalización del query), `biblioteca.test.tsx` (elegir "Escritorio" pide el
  criterio y la grilla muestra solo esos clips).

## Decisiones y alternativas consideradas

- **Criterio propio (`withoutGame`) en vez de un valor mágico de `game`** (p. ej. `game: '__none__'`):
  el main no tiene que adivinar; y un clip cuyo juego se llame "Escritorio" sigue filtrándose como
  el juego que es.
- **No tocar el modelo de datos**: no hace falta escribir `'Desktop'` en `clips.game` para los clips
  de escritorio. `NULL` ya significa exactamente eso, y escribirlo obligaría a migrar el catálogo y
  a distinguir el juego real "Desktop" del pseudo-juego.

## Riesgos

- **Ninguno serio**: es aditivo. El único cuidado es que `game` y `withoutGame` no se pisen; el
  repositorio da precedencia a `withoutGame` y hay test.

---

**Estado:** ✅ aprobado el 2026-07-11
