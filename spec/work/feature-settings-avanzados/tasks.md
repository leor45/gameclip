# Tasks — Settings avanzados (paridad con las apps de clips)

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. Fundación: modelo compartido (`capture.ts` campos nuevos + normalización), canales IPC,
       preload y stubs tipados en main (typecheck verde antes de paralelizar).
- [x] 2. Agente A — pipeline libobs: Advanced factories, tracks de audio, bitrate/CQP-CRF,
       mic por dispositivo + volumen, audio por app + juego detectado, enumeración de micrófonos,
       mapeos avanzados (cursor, HDR, WGC, overlays, window, aspect ratio), `audio-apps.ts`.
- [x] 3. Agente B — almacenamiento: `storage-manager.ts` (límite, auto-borrado, papelera, stats),
       wiring en `index.ts`, handler `settings:pick-output-dir`.
- [x] 4. Agente C — UI: layout de Ajustes con sub-nav + rutas anidadas, secciones General /
       Calidad / Audio / Almacenamiento / Avanzado, hook `useCaptureSettings`, estilos.
- [x] 5. Revisión del diff completo por el agente principal (rol de revisor delegado).
       *Resultado: 10 hallazgos (9 confirmados) aplicados en commit propio — religado en
       caliente del audio del juego (el rebuild vaciaba el replay buffer), detector emite el
       ejecutable real, cadena de rebuilds con catch, fallback de audio sin duplicación,
       lossless HW con QP 0, pistas AAC sin fuga, auto-borrado al cambiar ajustes, barra de
       uso normalizada, caché de enumeración de apps.*

## Tests unitarios (obligatorios)

- [x] `capture.ts`: normalización de todos los campos nuevos (válidos, inválidos, fuera de rango,
       `audioApps` con duplicados/exceso).
- [x] `capture-manager` + FakeObs extendido: pipeline recibe dispositivos/volúmenes/tracks según
       settings; religado en caliente al cambiar el juego detectado con `gameAudioEnabled`
       (sin rebuild); cadena de rebuilds no se envenena ante fallos.
- [x] `audio-apps`: parseo de la salida de enumeración (fixture), filtrado de procesos sin ventana.
- [x] `storage-manager`: borra los más viejos hasta quedar bajo el límite; respeta
       `onlyDeleteRecordings`; papelera vs borrado duro; sin límite = no borra; no borra el clip
       recién creado ni favoritos.
- [x] `ipc.test.ts`: canales nuevos cumplen formato (cobertura automática existente).
- [x] UI: cada sección renderiza y guarda (incl. toggles de comportamiento); navegación entre
       secciones; preset cards fijan valores; lista de apps añade/quita.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 26 archivos / 173 tests
- [x] Comprobación manual: selftest `GAMECLIP_SELFTEST=recording` ×2 en máquina real —
       (1) 720p60 ~15 Mbps CBR con **2 pistas AAC separadas** (ffmpeg confirma streams 0:1 y 0:2);
       (2) modo apps con captura por proceso, pista única y CQP automático (~4.4 Mb/s).
       Ajustes del usuario respaldados y restaurados tras la prueba.

## Cierre

- [x] Aprobación del plan (delegada al agente por el owner en esta sesión); revisión final del
       resultado pendiente del owner.
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`) — solo cuando el owner lo pida.
- [x] `spec/constitution/roadmap.md` actualizado (Fase 7).
