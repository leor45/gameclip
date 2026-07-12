# Plan — Estructura de carpetas por juego y nomenclatura de archivos

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

**El archivo se coloca después de guardarlo, no antes.** libobs escribe el clip con su propia
carpeta y su propio patrón de nombre (`recording.path` + su formato interno), y esa ruta se fija al
construir el pipeline — pero el juego puede cambiar *después* (cambio de foco, hotkey F10) sin
reconstruirlo, así que la carpeta que libobs conozca puede estar vencida en el momento de guardar.
Pelear con eso obligaría a rebuildear el pipeline en cada cambio de juego (y a perder el contenido
del buffer de repetición).

En cambio ya existe un post-proceso al cerrar cada clip: el remux que embebe los nombres de pista
(`applyTrackNames`). Se le suma un paso: **reubicar**. libobs sigue escribiendo donde quiera, y al
terminar movemos el archivo a `<carpeta>/<Juego|Desktop>/<Nombre> <marca>.mp4` con un `rename`
(mismo volumen → atómico e instantáneo). El evento `clip-saved` emite ya la ruta final, así que el
catálogo indexa directamente la definitiva.

### 1. Nomenclatura (funciones puras, con test)

`src/shared/clip-naming.ts`:

- `clipFolderName(gameExecutable | null)` → `'Terraria'` | `'Desktop'` (quita `.exe`, limpia los
  caracteres que Windows no admite en rutas).
- `clipTimestamp(date)` → `'2026.07.02 - 10.02.01.01'` (`AAAA.MM.DD - HH.MM.SS.CC`).
- `clipFileName({ base, date, kind, ext })` → `Terraria 2026… .mp4` |
  `Terraria Screenshot 2025… .png` (`kind: 'video' | 'screenshot'`).

Puras y en `shared/` porque también las quiere la migración y, más adelante, cualquier UI que
muestre el nombre esperado.

### 2. Reubicación al guardar (main)

`src/main/capture/relocate.ts`:

- `targetPathFor(outputDir, gameExe, date, kind, ext)` → ruta destino
  (`<outputDir>/<carpeta>/…` para video, `<outputDir>/<carpeta>/Capturas/…` para captura).
- `relocateSavedFile(file, target)` → `mkdir -p` + `rename`; si el destino ya existe, desambigua
  con ` (2)`, ` (3)`… Si el `rename` falla (archivo bloqueado, otro volumen), **devuelve la ruta
  original**: el clip nunca se pierde, solo se queda donde estaba.

`CaptureManager`: tras `applyTrackNames(file)`, llama a la reubicación con el ejecutable del juego
de esa grabación y emite `clip-saved` con la ruta final. El ejecutable sale de `detectedGameExe`
(clip retroactivo y grabación manual) o, en la grabación de sesión que corta al cambiar de juego,
del juego que se está cerrando (ya se pasa por parámetro; se resuelve su ejecutable con el mismo
helper que usa el pipeline).

### 3. Capturas de pantalla

`takeScreenshot(monitorIndex, outputDir, gameExe)` deja de escribir en `<outputDir>/Capturas` y usa
`targetPathFor(...'screenshot')` → `<outputDir>/<Juego|Desktop>/Capturas/<Nombre> Screenshot <marca>.png`.
El handler IPC le pasa el ejecutable del juego activo.

### 4. Catálogo: escaneo recursivo

`LibraryManager.reconcile` hoy hace un `readdirSync` plano de la carpeta. Pasa a recorrer también
las subcarpetas (`withFileTypes`, recursión acotada a la carpeta de clips). Sin esto, los clips
nuevos —que ya viven en subcarpetas— desaparecerían de la biblioteca en el primer reconcile.

### 5. Migración de lo existente (lo pidió el owner)

`src/main/library/migrate-layout.ts`, ejecutada una vez al arrancar (antes del `reconcile`), sobre
los clips del catálogo cuyo archivo está **suelto en la raíz** de la carpeta:

1. Carpeta destino: el ejecutable del juego que tenga el catálogo (`clip.game` → ejecutable, con el
   mismo mapa que usa la captura) o `Desktop` si no hay juego o no se reconoce.
2. Nombre nuevo con la marca de tiempo de `createdAt` del clip (que es el mtime del archivo).
3. `rename` + `repo.setPath(id, nuevaRuta)`, clip por clip y best-effort: el que falle se queda
   como está, con su fila intacta.
4. Las capturas sueltas de `<outputDir>/Capturas/*.png` se mueven a `Desktop/Capturas/` con el
   nombre nuevo (no están en el catálogo: es solo mover archivos).

Como el catálogo se actualiza en la misma pasada, la biblioteca conserva la tarjeta, la miniatura
(que vive en `userData`, no en la carpeta de clips) y el id — así que las URLs `gameclip-media://`
siguen valiendo.

## Archivos / módulos afectados

- `src/shared/clip-naming.ts` *(nuevo)* — nomenclatura pura (carpeta, marca de tiempo, nombre).
- `src/main/capture/relocate.ts` *(nuevo)* — ruta destino + `rename` seguro con desambiguación.
- `src/main/capture/manager.ts` — reubica al guardar; `clip-saved` emite la ruta final.
- `src/main/capture/screenshots.ts` — carpeta y nombre nuevos; recibe el ejecutable del juego.
- `src/main/ipc.ts` — pasa el juego activo al tomar la captura.
- `src/main/library/manager.ts` — `reconcile` recursivo.
- `src/main/library/migrate-layout.ts` *(nuevo)* + `clips-repository.ts` (`setPath`) — migración.
- `src/main/index.ts` — corre la migración una vez, antes del primer `reconcile`.
- Tests: `clip-naming.test.ts`, `relocate.test.ts`, `migrate-layout.test.ts` (nuevos); extender
  `capture-manager.test.ts` (el clip guardado termina en la carpeta del juego),
  `screenshots.test.ts` y `library-manager.test.ts` (reconcile recursivo).

## Decisiones y alternativas consideradas

- **Mover después de guardar** en vez de configurar la carpeta/formato de libobs: el juego puede
  cambiar sin reconstruir el pipeline (y reconstruirlo vaciaría el buffer de repetición). Además el
  `rename` en el mismo volumen es atómico y gratis, y ya hay un post-proceso en ese punto.
- **`Desktop` como carpeta de lo que no es juego** (nombre pedido por el owner), no `Escritorio`:
  coincide con la nomenclatura de los archivos.
- **Base del nombre = ejecutable sin `.exe`**, no el título de la ventana: es estable, corto y sin
  caracteres raros; el título cambia con el estado del juego.
- **La migración usa `createdAt` del catálogo** y no la hora actual: el nombre debe reflejar cuándo
  se grabó el clip, no cuándo se migró.
- **Reubicación best-effort**: si el archivo está bloqueado (el usuario lo tiene abierto), se deja
  donde está y se sigue. Perder el clip por un nombre bonito sería un mal negocio.

## Riesgos

- **La migración toca archivos del usuario.** Es `rename` dentro de la misma carpeta (mismo
  volumen, atómico), clip por clip y con el catálogo actualizado en el acto. Se prueba primero
  contra una copia de la carpeta real antes de darla por buena.
- **Colisión de nombres**: dos clips guardados en la misma centésima (imposible en la práctica) o
  un archivo ya existente en el destino → sufijo ` (2)`.
- **Carpeta de clips en otro volumen que el temporal de libobs**: `rename` fallaría; libobs escribe
  en la carpeta configurada, así que no debería pasar, pero el fallback (dejarlo donde está) lo
  cubre.
- **Carpetas vacías** tras el auto-borrado: quedan; limpiarlas está fuera de alcance.

---

**Estado:** ⏳ pendiente de aprobación
