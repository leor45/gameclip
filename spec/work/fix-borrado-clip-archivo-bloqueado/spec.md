# Spec — Fix: borrar un clip lo quita de la app pero no del disco

**Tipo:** Fix
**Rama:** `fix/borrado-clip-archivo-bloqueado`
**Fecha:** 2026-07-13

## Problema

Al eliminar un clip desde la biblioteca, desaparece de la app pero el archivo de video **sigue en la
carpeta**. Reportado en 0.5.1.

## Causa raíz

`LibraryManager.deleteClip` borra el archivo con `rmSync(clip.filePath, { force: true })` dentro de un
`try/catch` que **traga cualquier error** y borra el registro de la DB igual (el propio comentario ya
anticipaba "el archivo puede estar bloqueado por el reproductor").

En Windows el archivo lo tiene abierto **la propia app**: el protocolo `gameclip-media://` sirve el
fichero con un handle vivo (Chromium lo abre **sin** `FILE_SHARE_DELETE`) mientras el `<video>` de la
preview al hacer hover — o el reproductor — lo estén leyendo. Y el botón "Eliminar" aparece
precisamente al hacer hover, justo cuando la preview está montada.

Reproducido aislado con `fs`: con un handle de solo lectura estilo Chromium (`FileShare.Read`) abierto
sobre el `.mp4`, `rmSync(path, { force: true })` lanza **`EBUSY`** y el archivo sobrevive; al soltar el
handle, la misma llamada lo borra. `{ force: true }` no ayuda: solo silencia `ENOENT`, no un archivo en
uso. Es el mismo mecanismo que el fix `fix-guardar-edit-eperm` (EPERM al renombrar sobre el clip
abierto).

**Efecto secundario (zombie):** `reconcile` corre al arrancar y re-cataloga cualquier `.mp4` huérfano de
la carpeta como clip `scan`, así que ese clip "borrado" puede **reaparecer** en la biblioteca al
reiniciar. Al arreglar el borrado, deja de haber huérfano y desaparece el zombie.

## Alcance

**Dentro:**

- `deleteClip` **reintenta** el borrado del archivo ante `EPERM/EACCES/EBUSY` con backoff corto
  (soltar el handle es asíncrono; los reintentos cubren esa ventana y bloqueos ajenos transitorios).
- Si el archivo sigue en uso tras los reintentos, `deleteClip` **NO borra el registro** y falla con un
  mensaje en español; app y disco quedan consistentes y el usuario puede reintentar.
- La tarjeta **suelta la preview** (`onPreviewChange(false)`) antes de invocar el borrado, y si el
  borrado falla se lo avisa al usuario en vez de tragar el error.
- El auto-borrado por límite de almacenamiento tolera un clip en uso (lo salta, no aborta la poda).

**Fuera (explícito):**

- Cambiar el protocolo de medios para no mantener handles abiertos.
- Mover el borrado a la papelera desde el botón de la biblioteca (hoy es borrado definitivo; el
  auto-borrado por límite ya usa papelera y no se toca).

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] Test de regresión (rojo antes del fix): si el archivo está en uso, `deleteClip` no borra el
      registro y avisa en español; el clip sigue en el catálogo.
- [ ] Un borrado bloqueado que a la siguiente funciona (handle soltado) borra archivo y registro.
- [ ] La tarjeta suelta la preview antes de borrar y muestra el error si el borrado falla.
- [ ] El auto-borrado por límite salta un clip en uso sin abortar la poda.
- [ ] Gates verdes: `npm run typecheck`, `npm run lint`, `npm run test`.
