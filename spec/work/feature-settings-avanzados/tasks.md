# Tasks — Settings avanzados (paridad con las apps de clips)

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [ ] 1. Fundación: modelo compartido (`capture.ts` campos nuevos + normalización), canales IPC,
       preload y stubs tipados en main (typecheck verde antes de paralelizar).
- [ ] 2. Agente A — pipeline libobs: Advanced factories, tracks de audio, bitrate/CQP-CRF,
       mic por dispositivo + volumen, audio por app + juego detectado, enumeración de micrófonos,
       mapeos avanzados (cursor, HDR, WGC, overlays, window, aspect ratio), `audio-apps.ts`.
- [ ] 3. Agente B — almacenamiento: `storage-manager.ts` (límite, auto-borrado, papelera, stats),
       wiring en `index.ts`, handler `settings:pick-output-dir`.
- [ ] 4. Agente C — UI: layout de Ajustes con sub-nav + rutas anidadas, secciones General /
       Calidad / Audio / Almacenamiento / Avanzado, hook `useCaptureSettings`, estilos.
- [ ] 5. Revisión del diff completo por el agente principal (rol de revisor delegado).

## Tests unitarios (obligatorios)

- [ ] `capture.ts`: normalización de todos los campos nuevos (válidos, inválidos, fuera de rango,
       `audioApps` con duplicados/exceso).
- [ ] `capture-manager` + FakeObs extendido: pipeline recibe dispositivos/volúmenes/tracks según
       settings; re-build al cambiar el juego detectado con `gameAudioEnabled`.
- [ ] `audio-apps`: parseo de la salida de enumeración (fixture), filtrado de procesos sin ventana.
- [ ] `storage-manager`: borra los más viejos hasta quedar bajo el límite; respeta
       `onlyDeleteRecordings`; papelera vs borrado duro; sin límite = no borra; no borra el clip recién creado.
- [ ] `ipc.test.ts`: canales nuevos cumplen formato (cobertura automática existente).
- [ ] UI: cada sección renderiza y guarda; navegación entre secciones; preset cards fijan valores;
       lista de apps añade/quita.

## Verificación (gates)

- [ ] Type-check verde (`npm run typecheck`)
- [ ] Lint verde (`npm run lint`)
- [ ] Tests verdes (`npm run test`)
- [ ] Comprobación manual: selftest `GAMECLIP_SELFTEST=recording` graba 4 s reales; ffprobe
       muestra tracks separados con `separateAudioTracks`; ajustes persisten en
       `capture-settings.json`; navegación de submenús en `npm run dev`.

## Cierre

- [ ] Aprobación del owner (plan delegado; revisión final del owner sobre el resultado)
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`) — solo cuando el owner lo pida
- [ ] `spec/constitution/roadmap.md` actualizado
