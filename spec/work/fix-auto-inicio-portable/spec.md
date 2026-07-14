# Spec — Auto-inicio con Windows no arranca (portable)

**Tipo:** Fix
**Rama:** `fix/auto-inicio-portable`
**Fecha:** 2026-07-14

## Problema / Objetivo

Al activar "Iniciar GameClip con Windows", la app **sí** aparece en las aplicaciones de arranque de
Windows, pero al reiniciar **nunca se inicia** ni aparece en la bandeja.

**Causa raíz:** en `applyAutoLaunch` (`src/main/index.ts`), la llamada
`app.setLoginItemSettings({ openAtLogin, args: ['--hidden'] })` no fija `path`, así que Windows
registra `process.execPath`. En el **portable**, ese ejecutable es la **copia extraída en `%TEMP%`**
(`unpackDirName: GameClip-<version>` en `electron-builder.yml`), no el `.exe` real que ejecuta el
usuario. Esa carpeta temporal se limpia entre sesiones (y el stub extraído no es el launcher
portable), así que la entrada de arranque apunta a un ejecutable fantasma → no arranca nada.

El launcher portable de electron-builder expone la ruta real del `.exe` en la variable de entorno
`PORTABLE_EXECUTABLE_FILE`. Hay que registrarla a ella.

## Alcance

**Dentro:**
- Registrar en el arranque de Windows la ruta **real** del ejecutable portable
  (`process.env.PORTABLE_EXECUTABLE_FILE`), cayendo a `process.execPath` cuando no es portable.
- Mantener `args: ['--hidden']` para que arranque en la bandeja.
- Extraer la construcción de los `LoginItemSettings` a una función pura testeable.

**Fuera (explícito):**
- No se cambia la UI del ajuste ni su persistencia (el checkbox ya funciona).
- No se toca el flujo de `--hidden`/bandeja más allá de conservarlo.
- No se aborda auto-inicio para builds no portables (instalador): no existen hoy.

## Criterios de aceptación

- [ ] Test de regresión (rojo con el código actual): con `PORTABLE_EXECUTABLE_FILE` definido, los
      `LoginItemSettings` usan esa ruta como `path`; sin ella, usan `process.execPath`. En ambos
      casos `args` incluye `--hidden` y `openAtLogin` refleja el ajuste.
- [ ] Con el fix, activar el ajuste en el portable registra la ruta real y la app arranca en la
      bandeja tras reiniciar sesión (comprobación manual en build portable).
- [ ] Desactivar el ajuste quita la entrada de arranque.
- [ ] Type-check, lint y tests verdes.
