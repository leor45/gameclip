# Spec — "Tray is destroyed" al cerrar la app

**Tipo:** Fix
**Rama:** `fix/tray-destruida-al-cerrar`
**Fecha:** 2026-07-12

## Problema / Objetivo

Al cerrar la app **siempre** salta el diálogo nativo de Electron *"A JavaScript error occurred in the
main process — Uncaught Exception: Error: Tray is destroyed"*. Pasa en dev y en el `.exe`
empaquetado; el owner lo venía viendo desde antes y lo había atribuido a las pruebas.

## Causa raíz

El orden del teardown en `app.on('will-quit')` (`src/main/index.ts`):

```
overlay?.destroy();
tray?.destroy();     // ① la bandeja se destruye…
capture?.shutdown(); // ② …y DESPUÉS se apaga la captura
```

`CaptureManager.shutdown()` no es silencioso: llama a `setStatus()`, que emite un `status` final
(estado `idle`). El handler de ese evento —registrado en `setupCapture()`— hace
`tray?.setRecording(status.state === 'recording')`, y `Tray.setImage()` sobre una bandeja ya
destruida **lanza**. La excepción sube por `emit` → `shutdown` → `will-quit`, donde nadie la atrapa:
Electron la muestra como excepción no controlada.

Es exactamente el stack de la captura del owner: `App.emit` → `CaptureManager.shutdown` →
`CaptureManager.setStatus` → `CaptureManager.emit` → `Object.setRecording` → `Tray is destroyed`.

Son dos defectos, no uno:

1. **El orden está invertido:** lo que emite eventos (la captura) tiene que apagarse *antes* que sus
   oyentes (bandeja y overlay), no después.
2. **La bandeja no se defiende:** `setRecording()` toca el `Tray` sin comprobar que siga vivo, así
   que cualquier evento tardío la rompe. Y como la excepción revienta el `will-quit` a mitad de
   camino, **lo que venía después no corre**: hoy eso incluye `api?.close()`.

## Alcance

**Dentro:**

- Invertir el orden del teardown: primero se apaga lo que emite (hotkeys, PTT, timers, detector,
  captura) y después se destruyen los oyentes (overlay, bandeja) y se cierra la API.
- Que cada paso del cierre sea independiente: si uno falla, los demás corren igual (hoy una
  excepción deja libobs y la API sin cerrar).
- Que `AppTray.setRecording()` sea inofensiva después de `destroy()`.

**Fuera (explícito):**

- El arranque lento del portable (738 MB que se descomprimen en cada ejecución) — tarea aparte.
- El bug de la grabación manual (1 frame) — ya anotado, va en su propia rama.
- Rediseñar el ciclo de vida del `CaptureManager`.

## Criterios de aceptación

- [ ] Cerrar la app no muestra ningún diálogo de error, ni en dev ni en el `.exe`.
- [ ] Un `status` emitido durante el shutdown llega a una bandeja **viva** (el orden es correcto).
- [ ] `setRecording()` después de `destroy()` no lanza (la bandeja se defiende igual).
- [ ] Si un paso del cierre falla, los siguientes se ejecutan igual (libobs y la API se cierran).
- [ ] Test de regresión que reproduce el bug (rojo antes del arreglo).
- [ ] Gates verdes: type-check · lint · tests.
