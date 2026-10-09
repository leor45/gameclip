# Spec — Cancelar el UAC del auto-inicio elevado se daba por aplicado

**Tipo:** Fix
**Rama:** `fix/uac-cancelado-tarea-elevada`
**Fecha:** 2026-10-09

## Problema / Objetivo

Auditoría bug-hunter C, C2-BUG-1 (Medium). Al activar (o desactivar) «Iniciar como administrador» y
cancelar el aviso de UAC, la app lo daba por hecho: el ajuste quedaba activado sin tarea programada
detrás, y en cada arranque `ensureEnabled` volvía a pedir UAC. En sentido contrario, el ajuste se veía
apagado con la tarea todavía creada.

**Causa raíz:** `powershellElevatedArgs` corría
`$p = Start-Process … -Verb RunAs -Wait -PassThru; exit $p.ExitCode` sin `try/catch`. El fallo de
`Start-Process` (UAC cancelado: error de `ShellExecute`) es **no terminante**: `$p` queda `$null` y
`exit $null` sale con 0. Medido en la máquina del owner con el comando exacto y un exe inexistente:
`$?` = False, `$p` = null, **EXIT=0**. El comentario del código afirmaba lo contrario.

## Alcance

**Dentro:**
- `powershellElevatedArgs`: `-ErrorAction Stop` dentro de `try { … } catch { exit 1 }`, conservando el
  exit code real de schtasks cuando sí corre.
- Test de regresión.

**Fuera (explícito):**
- `powershellRelaunchElevatedArgs` (relanzar como admin): comprobado, ya sale con 1 si Start-Process
  falla.

## Criterios de aceptación

- [ ] El comando generado sale con 1 si `Start-Process` falla (comprobado de verdad con un exe
      inexistente, sin disparar UAC) y propaga el exit code del proceso cuando arranca.
- [ ] Suite verde.
