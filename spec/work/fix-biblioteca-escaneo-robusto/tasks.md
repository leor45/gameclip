# Tasks — El escaneo de la biblioteca: carpetas ilegibles, grabación en curso y unidades sin montar

## Tests unitarios (obligatorios; primero, en rojo)

- [x] Regresión D5-BUG-1: subcarpeta sin permiso (EPERM simulado) → no lanza, lo legible se cataloga.
- [x] Regresión D5-BUG-1: la carpeta de clips entera ilegible → no lanza ni da de baja nada.
- [x] Regresión D5-BUG-1: archivo que desaparece entre el listado y el `stat` → se salta.
- [x] Regresión D5-BUG-1: `$Recycle.Bin`, `$RECYCLE.BIN` y `System Volume Information` (también dentro
      de un volumen montado en una carpeta) no se catalogan.
- [x] Regresión D5-BUG-3: un clip de una unidad no montada conserva fila, título, etiquetas,
      favorito, pistas muteadas y miniatura.
- [x] No regresión: en la misma pasada, el clip borrado de una unidad montada se da de baja con su
      miniatura.
- [x] Unidad caída: una consulta a su raíz por pasada y ninguna por clip.
- [x] Regresión D5-BUG-2: grabando no se escanea; el re-etiquetado y el límite sí corren.
- [x] Regresión D5-BUG-2 (integración con el catálogo real): el MP4 en la raíz durante la grabación,
      tras reubicarlo y registrarlo, deja una sola fila `recording` con el tamaño final.
- [x] Regresión D5-BUG-1: un escaneo, re-etiquetado, límite u `outputDir()` que lanzan no salen del
      listener, y el resto de pasos corre.
- [x] No regresión: sin grabación (`idle`, `buffering`, `initializing`, `unavailable`) escanea,
      re-etiqueta y aplica el límite, en ese orden.

## Implementación

- [x] 1. Extraer el listener de `'settings'` a `settings-sync.ts` tal cual (refactor puro), para
      poder probarlo en rojo.
- [x] 2. `mediaFilesIn`: carpetas de sistema fuera y `readdirSync` en try/catch.
- [x] 3. `reconcile`: el `stat` de las altas en try/catch; bajas solo con la unidad accesible,
      memorizada por raíz.
- [x] 4. `syncLibraryAfterSettings`: sin escaneo grabando, pasos aislados, nunca lanza.
- [x] 5. `setupLibrary`: la migración y el escaneo inicial en try/catch.

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes (85 archivos, 1072 tests)
- [x] Medido en Windows: raíces de `path.parse` (`D:\`, `\\servidor\recurso\`, `\\?\D:\`),
      `existsSync` de una letra sin unidad (false), `rmSync({ force: true })` sobre una unidad
      inexistente (no lanza), nombres reales de la papelera (`$Recycle.Bin` en C:, `$RECYCLE.BIN` en
      D:) y `EPERM` de `readdirSync('C:\System Volume Information')`. En UNC, `existsSync` de la raíz
      `\\localhost\C$\` da true (5 ms) y la de un recurso inexistente da false tras ~4 s: con la
      unidad mirada primero y memorizada, es una espera por pasada y no una por clip.
- [ ] Comprobación manual en la app: carpeta de clips en la raíz de una unidad y un USB desenchufado
      al arrancar (en este fix no se ejecutó la app).

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
