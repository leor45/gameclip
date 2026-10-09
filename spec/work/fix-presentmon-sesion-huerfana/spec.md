# Spec — Parar PresentMon deja su sesión ETW huérfana

**Tipo:** Fix
**Rama:** `fix/presentmon-sesion-huerfana`
**Fecha:** 2026-10-09

## Problema / Objetivo

Auditoría bug-hunter C, C3-BUG-1 (Medium). Cada parada normal de los FPS del overlay de rendimiento
—cerrar GameClip, desmarcar FPS, apagar el overlay— deja la sesión ETW `GameClipPerf` activa,
reteniendo cupo de los proveedores DXGI/D3D9/DxgKrnl hasta reiniciar Windows o hasta que GameClip
vuelva a abrir PresentMon. Con los cupos agotados, PresentMon y otros overlays (NVIDIA incluido) se
quedan mudos: es lo que la memoria del proyecto documenta medido en la máquina del owner tras matar
`gc-presentmon.exe` a la fuerza.

**Causa raíz:** `PresentMonReader.stop()` para el proceso con `child.kill()`, que en Windows es
`TerminateProcess`: PresentMon no llega a cerrar su sesión. El binario incluido soporta
`--terminate_existing_session` (cierra la sesión y sale sin capturar), pero la app nunca lo usa; solo el
siguiente arranque la recupera con `--stop_existing_session`.

## Alcance

**Dentro:**
- `stop()`: tras matar el proceso, correr `gc-presentmon.exe --terminate_existing_session
  --session_name GameClipPerf` de forma síncrona (medido: ~35 ms) con tope de 3 s, best-effort.
- Nombre de la sesión en una constante compartida por la apertura y el cierre.
- Tests de regresión.

**Fuera (explícito):**
- El reinicio del watchdog (mata y relanza con `--stop_existing_session`, que ya recupera la sesión).
- Cerrar sesiones de otros capturadores.

## Criterios de aceptación

- [ ] `stop()` con PresentMon vivo lanza el cierre de la sesión `GameClipPerf` después del kill; sin
      proceso vivo no lanza nada; un fallo del cierre no rompe `stop()`.
- [ ] Suite verde.
