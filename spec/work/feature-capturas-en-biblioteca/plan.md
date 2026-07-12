# Plan — Capturas de pantalla en la biblioteca

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

### 1. El catálogo aprende que un ítem puede ser una imagen

Columna nueva `kind TEXT NOT NULL DEFAULT 'video'` (migración #5) y `Clip.kind: 'video' | 'image'`.
El valor **se deriva de la extensión** al dar de alta (`.png` → imagen), no del `source`: así da
igual si el archivo lo registró la hotkey o lo encontró el escaneo, y no hace falta un `ClipSource`
nuevo que luego haya que interpretar en cinco sitios.

`kind` es lo que consulta la UI para decidir qué es cada cosa; `source` sigue diciendo de dónde
salió (`replay`/`recording`/`scan`).

### 2. Ingesta

- **Hotkey / botón:** `takeScreenshot` ya devuelve la ruta. El main la registra en el catálogo con
  el juego activo (`library.registerSavedClip(path, 'scan', game)`), igual que un clip guardado, y
  emite `library:changed` → la biblioteca se actualiza sola.
- **Escaneo:** `reconcile` acepta `.png` además de los videos. Como ya es recursivo (Fase 10), las
  `Capturas/` entran solas.
- **Juego inferido de la carpeta:** para lo escaneado, el primer segmento bajo la carpeta de clips
  es la base del nombre (`Terraria`, `Desktop`). Se traduce a nombre de juego con el mismo mapa que
  usa la captura (`Desktop` → `null`). Hoy `reconcile` mete `game: null` siempre; esto mejora
  también los clips escaneados, y es la única forma de que una captura escaneada se filtre por su
  juego.

### 3. Miniatura y visor

- `useThumbnailer` genera la miniatura desde un `<img>` en canvas cuando `kind === 'image'` (hoy
  solo sabe de `<video>`). Sin esto la grilla cargaría el PNG entero por tarjeta.
- `ClipCard`: si es imagen → sin botón de editor, sin preview en hover (el borde queda). El
  thumbnail sale del mismo `thumbMediaUrl`.
- `ClipPlayer`: si es imagen → `<img>` en vez de `<video>` (mismo diálogo, mismo cierre).
- El protocolo de medios no cambia: `gameclip-media://clip/<id>` sirve el archivo que sea.

### 4. Almacenamiento

- `StorageStats` gana `screenshotsBytes`; el sidebar suma los tres (clips + grabaciones + capturas)
  y Ajustes lo muestra en su leyenda.
- `StorageManager.enforceLimit` **excluye** `kind === 'image'` de los candidatos a borrar (decisión
  del owner). El límite sigue midiéndose sobre el total: las capturas ocupan, pero se libera espacio
  borrando videos.

## Archivos / módulos afectados

- `src/shared/library.ts` — `Clip.kind`, `StorageStats.screenshotsBytes`, helper `kindForFile(path)`.
- `src/main/library/clips-repository.ts` — migración #5, `kind` en `insert`/`toClip`.
- `src/main/library/manager.ts` — `reconcile` indexa PNG e infiere el juego desde la carpeta.
- `src/main/library/storage-manager.ts` — `screenshotsBytes` y exclusión del auto-borrado.
- `src/main/index.ts` / `src/main/ipc.ts` — registrar la captura recién tomada en el catálogo.
- `src/renderer/lib/useThumbnailer.ts` — miniatura desde imagen.
- `src/renderer/components/ClipCard.tsx` — tarjeta de imagen (sin editor, sin preview).
- `src/renderer/components/ClipPlayer.tsx` — visor de imagen.
- `src/renderer/components/StorageIndicator.tsx` + `views/ajustes/Almacenamiento.tsx` — sumar
  capturas al uso.
- Tests: repositorio (migración + `kind`), manager (escaneo de PNG e inferencia de juego),
  storage-manager (cuentan pero no se borran), `biblioteca.test.tsx` (tarjeta de imagen: sin
  editor, sin preview, visor de imagen), `sidebar.test.tsx` (el anillo incluye las capturas).

## Decisiones y alternativas consideradas

- **`kind` derivado de la extensión** en vez de un `ClipSource: 'screenshot'`: el origen y la
  naturaleza del archivo son dos cosas distintas. Un PNG escaneado a mano en la carpeta es una
  imagen aunque su `source` sea `scan`.
- **Miniatura propia para las imágenes** en vez de usar el PNG directo en la grilla: 30 tarjetas ×
  varios MB de PNG es exactamente el tipo de coste que la preview en hover se cuidó de evitar.
- **Auto-borrado que no toca capturas** (decisión del owner): el límite es para los videos.
- **Juego inferido de la carpeta** en vez de guardar el juego en un sidecar o en metadatos EXIF: la
  carpeta ya lo dice, y la Fase 10 la hizo fiable.

## Riesgos

- **La inferencia por carpeta puede fallar** con carpetas creadas a mano por el usuario: si el
  nombre no matchea ningún juego conocido, se guarda tal cual como nombre de juego (lo que el
  usuario espera al ver la carpeta) — nunca lanza.
- **Clips escaneados que hoy tienen `game: null`** no se re-etiquetan solos (el `reconcile` solo
  toca los que da de alta). No es una regresión: es el estado actual.

---

**Estado:** ✅ aprobado por el owner (2026-07-11) e implementado
