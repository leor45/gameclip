# Tasks — Fix: borrar un clip lo quita de la app pero no del disco

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Tests de regresión (primero, en rojo)

- [x] 1. `deleteClip` con archivo en uso: `removeFile` inyectado lanza `EBUSY` siempre → rechaza con
      `/en uso/i`, el clip sigue en `list()` y no se emite `changed`.
- [x] 2. `deleteClip` con bloqueo transitorio: `removeFile` lanza `EBUSY` una vez y a la segunda borra
      de verdad → archivo y registro desaparecen.

## Implementación

- [x] 3. `manager.ts`: `LibraryOptions` + `removeFile?`/`sleep?`; `deleteClip` async con helper
      `removeClipFile` (reintentos EPERM/EACCES/EBUSY, backoff lineal); registro solo si el archivo se
      fue.
- [x] 4. `storage-manager.ts`: `await deleteClip`; `enforceLimit` salta con `continue` un clip en uso.
- [x] 5. `ClipCard.tsx`: `eliminar` suelta la preview (`onPreviewChange(false)`) y muestra el error si
      `remove` falla.
- [x] 6. Actualizar el test existente `deleteClip borra archivo, thumbnail y registro` para `await`.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 564/564
- [ ] Comprobación manual: hover sobre una tarjeta → Eliminar → el archivo desaparece de la carpeta.
      (El owner quedó en probarlo en su equipo.)

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
