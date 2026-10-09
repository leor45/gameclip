# Tasks — Un fallo al lanzar un helper nativo tumba el proceso principal

## Tests unitarios (obligatorios; primero, en rojo)

- [x] `safeSpawn` con `spawn` inyectado: throw síncrono, solo `'error'`, `'error'` + `'exit'` → un único
      fin, entregado después de suscribirse; `kill()` tras un fallo no lanza; un `'error'` con `pid`
      (kill fallido) no cuenta como fin; log de una línea con helper y código.
- [x] `safeSpawn` con proceso sano: opciones tal cual, `exit` síncrono y único, `kill()` delega.
- [x] `safeSpawn` con el `spawn` real de Node: archivo no ejecutable y ruta inexistente.
- [x] Por wrapper, con el `spawn` real: Sensores y PresentMon no lanzan y reintentan con su cadencia
      (5 s ×3, luego 60 s, con su reloj inyectable); `PerfSampler.configure()` no lanza; háptico y
      mandos no lanzan, no se relanzan solos y el siguiente `apply` lo reintenta; `kill()`/`stop()` en
      el mismo tick del fallo no lanzan.
- [x] Por wrapper, camino sano: mismas opciones de `spawn`, líneas, `exit` y `kill` de siempre.
- [x] Rojo antes del fix: 13 tests fallan (EFTYPE síncrono, `kill EINVAL`, ningún reintento tras un
      ENOENT) más 8 excepciones no capturadas; los 4 del camino sano ya pasaban.

## Implementación

- [x] 1. `src/main/safe-spawn.ts`.
- [x] 2. `realSensorsSpawn` y `realPresentMonSpawn`.
- [x] 3. `realSpawn` de háptico y de mandos.

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes
- [x] Medido con Node: `.txt` → EFTYPE síncrono; `.exe` basura → UNKNOWN síncrono; ruta inexistente →
      `'error'` ENOENT diferido sin `'exit'`, `pid` undefined y `kill()` en el mismo tick → EINVAL;
      tras el ENOENT el readline y los pipes se cierran solos.

## Cierre

- [x] Aprobación del owner
- [x] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
