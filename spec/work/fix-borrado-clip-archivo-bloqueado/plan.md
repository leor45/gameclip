# Plan — Fix: borrar un clip lo quita de la app pero no del disco

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Reproducir el patrón ya probado en `fix-guardar-edit-eperm`: reintentar la operación de disco mientras
el handle de Chromium se suelta, y si persiste el bloqueo fallar con un mensaje claro sin dejar el
estado inconsistente.

1. **`deleteClip` → async con reintentos.** Extrae el borrado del archivo a un helper que reintenta
   ante `EPERM/EACCES/EBUSY` con backoff lineal (6 intentos × 150 ms). Clave: **el registro solo se
   borra si el archivo se pudo borrar** (o ya no existía — `force:true` hace no-op de `ENOENT`). Si
   tras los reintentos sigue en uso, lanza `Error` en español y **no** toca la DB ni emite `changed`.
   `sleep` y la función de borrado se inyectan por `LibraryOptions` para testear el lock sin depender
   del SO.

2. **Renderer suelta la preview y muestra el error.** En `ClipCard.eliminar`, tras confirmar, llamar
   `onPreviewChange?.(false)` para desmontar el `<video>` de la preview (lo que cierra el handle) y
   envolver `remove` en try/catch para avisar al usuario si falla (el registro sigue vivo, la tarjeta
   permanece).

3. **Auto-borrado tolerante.** `StorageManager.enforceLimit` salta con `continue` el clip cuyo borrado
   lanza (en uso), sin contarlo como borrado ni abortar la poda.

## Archivos / módulos afectados

- `src/main/library/manager.ts` — `deleteClip` async + helper `removeClipFile` con reintentos;
  `LibraryOptions` gana `removeFile?` y `sleep?` inyectables.
- `src/main/library/storage-manager.ts` — `removeClip`/`enforceLimit` toleran un clip en uso.
- `src/main/ipc.ts` — el handler ya devuelve el Promise; sin cambios funcionales (verificar).
- `src/renderer/components/ClipCard.tsx` — `eliminar` suelta la preview y surface del error.
- `src/main/__tests__/library-manager.test.ts` — `await deleteClip`; tests de regresión (bloqueado
  persistente y bloqueado que se libera).

## Decisiones y alternativas consideradas

- **Reintento async con `sleep` inyectado** vs `rmSync({ maxRetries, retryDelay })` — el retry nativo de
  `rmSync` bloquea el hilo (congelaría la UI del main); el bucle async no.
- **No borrar el registro si el archivo queda** vs mantener el comportamiento viejo (borrar igual) — el
  viejo es la causa del bug (deja archivo huérfano que además revive por `reconcile`). La consistencia
  app↔disco es el objetivo.
- **Mensaje en español propio** ("no se pudo borrar… está en uso") reutilizando el tono del fix de
  edición, en vez de propagar el `EBUSY` crudo.

## Riesgos

- Un clip realmente bloqueado por otra app (reproductor externo) ahora **no se borra** y avisa; es el
  comportamiento correcto, pero cambia la expectativa de "siempre desaparece". El reintento y el
  soltar-preview cubren el caso normal (bloqueo por la propia app).
- `deleteClip` pasa a async: revisar todos los llamadores (`ipc.ts`, `storage-manager.ts`, tests) para
  no dejar promesas sin await.

---

**Estado:** ✅ aprobado el 2026-07-13 (OK del owner: "Dale")
