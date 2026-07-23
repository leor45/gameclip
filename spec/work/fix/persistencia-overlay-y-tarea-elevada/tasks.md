# Tasks — Persistencia del overlay oculto y tarea elevada tras actualizar

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. Agregar `perfOverlayVisible` a `CaptureSettings`, defaults y normalizacion.
- [x] 2. Cambiar `PerfOverlayController` para recibir visibilidad persistida en vez de usar `oculto`
      interno.
- [x] 3. Cambiar el handler de la accion configurable `perfOverlayHotkey` para persistir el toggle con
      `capture.setSettings`.
- [x] 4. Ajustar Ajustes -> Avanzado para que activar manualmente el overlay lo deje visible.
- [x] 5. Extraer helpers de tarea elevada: comando esperado, parseo/consulta y decision de reparacion.
- [x] 6. Ejecutar la reparacion idempotente de la tarea elevada al arrancar si
      `autoLaunchElevated` esta activo.
- [x] 7. Re-registrar atajos solo si cambian sus combinaciones o condiciones de activacion.
- [x] 8. Agregar deteccion de proceso elevado y relaunch `RunAs` sobre el exe real del portable.
- [x] 9. Integrar el relaunch despues de `barrerTemporales(true)` y antes de inicializar API/captura/UI.
- [x] 10. Liberar el single-instance lock solo cuando el relaunch elevado haya arrancado.

## Tests unitarios (obligatorios)

Camino feliz **y** casos borde. Si es un Fix: el test de regresión va primero (rojo → verde).

- [x] Regresion overlay: settings sin `perfOverlayVisible` migran a `true`; `false` se respeta.
- [x] Regresion UI: activar el overlay desde Ajustes guarda `perfOverlayEnabled: true` y
      `perfOverlayVisible: true`.
- [x] Regresion tarea elevada: exe anterior en el action => se recrea con el exe actual.
- [x] Caso borde tarea elevada: action correcto => no recrea ni llama al runner elevado.
- [x] Caso borde tarea elevada: consulta fallida/no existe => intenta crear una vez y reporta fallo sin
      excepcion si el UAC se cancela.
- [x] Regresion atajo: cambiar solo `perfOverlayVisible` no fuerza un re-registro global.
- [x] Regresion relaunch: con `autoLaunchElevated` activo y proceso no elevado, se pide relaunch con el
      exe real y se conservan args como `--hidden`.
- [x] Caso borde relaunch: si el proceso ya esta elevado, no intenta relanzar.
- [x] Caso borde relaunch: si UAC se cancela/falla, la instancia actual sigue abierta.
- [x] Regresion temporales: un payload versionado anterior (`GameClip-<version>`) se barre aunque sea
      reciente; el margen de seguridad queda solo para staging ambiguo.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`)
- [x] Comprobacion manual: ocultar overlay con el atajo configurado, reiniciar app/PC y verificar que
      sigue oculto.
- [x] Comprobacion manual: una pulsacion del atajo configurable alterna una vez y no parpadea.
- [x] Comprobacion manual: con auto-inicio elevado activo, simular/usar exe version anterior en la
      tarea y verificar que al abrir la version nueva se actualiza el action.
- [ ] Comprobacion manual: con auto-inicio elevado activo, abrir el portable sin admin y verificar que
      se relanza elevado; abrirlo ya elevado no relanza.
- [ ] Comprobacion manual: tras el relaunch, confirmar que no se acumulan temporales del portable.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
