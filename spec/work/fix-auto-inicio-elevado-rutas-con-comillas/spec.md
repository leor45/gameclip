# Spec — El auto-inicio elevado fallaba con una ruta del portable que lleva ’

**Tipo:** Fix
**Rama:** `fix/auto-inicio-elevado-rutas-con-comillas`
**Fecha:** 2026-10-09

## Problema / Objetivo

Hallazgo preexistente nº 7 de la tanda D (Bajo). Si el portable vive en una carpeta con una comilla
tipográfica (`D:\Juegos de Leo’s\GameClip.exe`), activar «Iniciar con Windows como administrador» no
funciona: PowerShell da un error de sintaxis, `schtasks` no llega a correr y el ajuste se revierte solo
(parece que cancelaste el UAC). Lo mismo pasa al relanzar la app como administrador en el arranque con
el ajuste ya activo: el relanzado falla y la app sigue sin admin.

**Causa raíz:** `powershellElevatedArgs` y `powershellRelaunchElevatedArgs`
(`src/main/elevated-launch.ts`) metían la ruta del portable (y los flags) **dentro del texto del script**
de PowerShell, entre comillas simples, escapando solo la `'` ASCII. PowerShell también trata
‘ ’ ‚ ‛ (U+2018, U+2019, U+201A, U+201B) como comillas simples, así que una ruta con cualquiera de
ellas cerraba la cadena antes de tiempo (ParserError «Falta la cadena en el terminador»). Es la misma
causa raíz que D4-BUG-4 («Copiar», ver `fix-texto-no-ascii-windows`): escapar solo la `'` ASCII no
basta.

## Alcance

**Dentro:**
- La línea de argumentos de `schtasks` (crear/borrar la tarea), la ruta del exe a relanzar y sus
  argumentos viajan por **variables de entorno del proceso hijo**, nunca dentro del script. No queda
  ninguna interpolación del dato en el texto de `-Command`.
- `powershellElevatedArgs` y `powershellRelaunchElevatedArgs` devuelven `{ args, env }` (con
  `baseEnv = process.env` inyectable, como `setClipboardFileCommand`); `ElevatedLaunchDeps.run` recibe
  el `env` y `realRun` / `realRelaunch` lo pasan a `spawn`.
- Tests de regresión, incluido uno con PowerShell real.

**Fuera (explícito):**
- Cambiar qué hace el script (`-Verb RunAs`, `-WindowStyle Hidden -Wait -PassThru -ErrorAction Stop`,
  `try/catch`, `exit $p.ExitCode`) o cómo se crea la tarea (`schtasksCreateArgs`).
- Otros sitios que interpolan datos en scripts de PowerShell (se listan en el informe, no se tocan).

## Criterios de aceptación

- [ ] Con ’ ‘ ‚ ‛ y `'` en la ruta, el `-Command` generado no contiene la ruta ni ninguna comilla
      simple, y la ruta llega intacta en `env`.
- [ ] PowerShell real: el script parsea y `Start-Process` recibe la ruta (y los argumentos) byte a
      byte, tanto en el alta de la tarea como en el relanzado.
- [ ] El exit code se sigue propagando: UAC cancelado / fallo de Start-Process ⇒ salida 1 (⇒ `false`),
      y el exit code real del proceso elevado cuando arranca.
- [ ] `--hidden` y demás argumentos llegan como antes; `env` hereda `process.env` (PATH, SystemRoot…).
- [ ] Suite verde.
