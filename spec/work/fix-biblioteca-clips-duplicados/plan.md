# Plan — Clips duplicados en la biblioteca

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Una sola idea: **el catálogo tiene una única forma canónica de una ruta**, y nadie puede insertar
ni consultar por fuera de ella. Hoy la forma depende de quién llame (libobs con `/`, Node con
`\`), y ahí nace el duplicado.

### 1. Ruta canónica (función pura)

`canonicalClipPath(p)`: `resolve()` (absolutiza y unifica separadores a los nativos) + colapsar
barras finales. La comparación es aparte y **case-insensitive**, porque NTFS lo es: se guarda la
ruta con su capitalización original (que es la que ve el usuario y la que abre el Explorador) pero
se busca con `COLLATE NOCASE`.

Test-first: el test de regresión hace `registerSavedClip('D:\dir/clip.mp4')` + `reconcile('D:\dir')`
y hoy da 2 clips; con el fix, 1.

### 2. La canonicalización vive en el repositorio, no en los llamadores

`insert`, `getByPath` y `allPaths` normalizan la ruta que reciben. Es la frontera correcta: da
igual si mañana aparece una tercera vía de alta (importar, arrastrar y soltar), no puede meter una
ruta cruda. `LibraryManager` no cambia su lógica; solo se apoya en que el repo es consistente.

`getByPath` pasa a comparar `file_path = ? COLLATE NOCASE`, y el índice `UNIQUE` se acompaña de un
**índice único case-insensitive** (`UNIQUE INDEX … ON clips(file_path COLLATE NOCASE)`) para que la
DB misma impida el duplicado aunque alguien esquive el repositorio.

### 3. Migración: canonicalizar y fusionar lo ya duplicado

Migración #3, en JS dentro del repositorio (no SQL suelto: hay que fusionar campos y borrar
miniaturas):

1. Canonicalizar `file_path` de todas las filas.
2. Agrupar por ruta canónica en minúsculas. Con más de una fila por grupo, **fusionar**: se
   conserva el registro más antiguo (id menor, el que la captura creó y que tiene la miniatura y la
   duración ya calculadas) y se rellenan de los descartados los campos que le falten
   (`duration_seconds`, `thumbnail_path`, `game`), con `favorite` por OR y las etiquetas unidas.
3. Los ids descartados se borran, y `LibraryManager` borra sus miniaturas al arrancar (el repo
   devuelve las rutas de las miniaturas huérfanas; borrar archivos no es tarea del repo).

Como la fusión conserva el id menor, las miniaturas y las URLs `gameclip-media://clip/<id>` de ese
registro siguen siendo válidas.

### 4. Efecto en Almacenamiento

Nada que tocar: el uso de disco se calcula sumando `size_bytes` del catálogo, así que al quedar un
registro por archivo deja de contarse doble. Se añade un test que lo fija.

## Archivos / módulos afectados

- `src/shared/library.ts` — `canonicalClipPath` (pura) + su test.
- `src/main/library/clips-repository.ts` — normalización en `insert`/`getByPath`/`allPaths`,
  `getByPath` con `COLLATE NOCASE`, migración #3 (canonicalizar + fusionar) y método que expone
  las miniaturas huérfanas de la fusión.
- `src/main/library/manager.ts` — al arrancar, borra las miniaturas huérfanas que dejó la fusión.
- Tests: `clips-repository.test.ts` (regresión del duplicado, capitalización, migración con
  duplicados reales), `library-manager.test.ts` (alta con ruta de libobs + reconcile → 1 clip),
  `storage-manager.test.ts` (el archivo no se cuenta dos veces).

## Decisiones y alternativas consideradas

- **Canonicalizar en el repositorio** en vez de en cada llamador (o en `CaptureManager`, arreglando
  solo la ruta de libobs): tapa la clase entera de bug, no una instancia. Arreglar solo libobs
  dejaría vivo el mismo fallo ante cualquier ruta con otra forma (capitalización, `..`, barra final).
- **Guardar la capitalización original y comparar con `COLLATE NOCASE`** en vez de guardar la ruta
  en minúsculas: la ruta se usa para abrir el archivo y mostrarla en el Explorador; bajarla a
  minúsculas sería feo y, en un futuro no-Windows, incorrecto.
- **Fusionar en vez de borrar el duplicado a ciegas**: el registro `scan` puede tener datos que el
  otro no (o al revés, según cuál miniaturizó primero el renderer); fusionar evita perder favoritos
  o etiquetas puestos sobre la tarjeta "equivocada".
- **Conservar el id menor**: mantiene válidas las miniaturas y las URLs del protocolo de medios.

## Riesgos

- **La migración toca datos del usuario.** Corre dentro de la transacción de migración (todo o
  nada) y se prueba contra una DB sembrada con el caso real antes de dar por buena la tarea.
- **`resolve()` depende del cwd** si le llega una ruta relativa. En la práctica siempre llegan
  absolutas (libobs y `join(outputDir, …)`); igual se cubre con un test.
- **Rutas UNC** (`\\servidor\clips`): `resolve()` las respeta, pero no es un caso soportado hoy y
  queda fuera de alcance.

---

**Estado:** ✅ aprobado el 2026-07-11

> Ajuste al implementar: `canonicalClipPath` vive en `src/main/library/clip-path.ts`, no en
> `src/shared/library.ts` — usa `node:path` y `shared/` lo importa también el renderer.
