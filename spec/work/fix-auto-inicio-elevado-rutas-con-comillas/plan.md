# Plan — El auto-inicio elevado fallaba con una ruta del portable que lleva ’

> **Este plan es un contrato.** Diseño aprobado por el owner antes de codear.

## Enfoque

Mismo patrón que «Copiar» (`src/main/export/clipboard.ts`): el dato no se interpola en el script, viaja
en una variable de entorno del hijo (que solo existe en ese proceso).

1. `powershellElevatedArgs(schtasksArgLine, baseEnv = process.env)` → `{ args, env }`. El script es
   fijo: `try { $p = Start-Process -FilePath schtasks.exe -ArgumentList $env:GAMECLIP_SCHTASKS_ARGS
   -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ErrorAction Stop; exit $p.ExitCode } catch { exit 1 }`.
   `env = { ...baseEnv, GAMECLIP_SCHTASKS_ARGS: línea }`. PowerShell no vuelve a expandir el valor de
   una variable, así que la línea llega a `Start-Process` como la cadena exacta que antes iba entre
   comillas simples.
2. `powershellRelaunchElevatedArgs(exePath, appArgs, baseEnv = process.env)` → `{ args, env }`.
   Script: `try { Start-Process -FilePath $env:GAMECLIP_RELAUNCH_EXE [-ArgumentList
   @($env:GAMECLIP_RELAUNCH_ARG_0, …)] -Verb RunAs; exit 0 } catch { exit 1 }`. Es el mismo array de
   cadenas que antes (`@('…', '…')`), así que `Start-Process` lo trata igual; sin argumentos no se
   emite `-ArgumentList`, como antes.
3. `ElevatedLaunchDeps.run` pasa de `(args)` a `(args, env)`; `ElevatedAutoLaunch.setEnabled` desestructura
   el `{ args, env }`. `realRun` y `realRelaunch` pasan `env` a `spawn`. `ElevationRelaunchDeps.relaunch`
   no cambia (`(exePath, appArgs)`): quien arma el comando es `realRelaunch`.

## Archivos / módulos afectados

- `src/main/elevated-launch.ts`
- `src/main/__tests__/elevated-launch.test.ts`
- Llamadores (`src/main/index.ts`: `createElevatedAutoLaunch` / `createElevationRelaunch`) no cambian:
  su API pública (`setEnabled`, `ensureEnabled`, `relaunch`) es la misma.

## Decisiones y alternativas consideradas

- **Entorno** frente a escapar también ‘ ’ ‚ ‛ (y duplicarlas): escapar exige acertar con todas las
  reglas del tokenizador de PowerShell (y hay más sitios con el mismo patrón); sin interpolar no hay
  nada que escapar. Es lo que ya se hizo en «Copiar».
- **`run(args, env)`** frente a `run({ args, env })`: conserva el primer parámetro de los tests
  existentes (`run.mock.calls[0][0]`) y deja claro que el `env` es un extra.
- El script no cambia en lo demás (`-Verb RunAs`, `-WindowStyle Hidden -Wait -PassThru -ErrorAction
  Stop`, `try/catch`, `exit`): los arreglos de `fix-uac-cancelado-tarea-elevada` se conservan.

## Riesgos

- **Perder la herencia del entorno** (PATH, SystemRoot…): sin ellos powershell/schtasks no arrancan.
  `env` parte de una copia de `process.env` (test: hereda todo y no escribe en el original).
- **Que el array desde variables se comporte distinto del literal:** cubierto con un test con
  PowerShell real que recibe `-ArgumentList` como `string[]` y con una comprobación manual con
  `Start-Process` real (sin `-Verb RunAs`, para no disparar UAC) que arranca un hijo que vuelca su
  línea de comandos.
- **Variables heredadas por el proceso elevado** (`GAMECLIP_*` en el entorno del hijo y, por herencia,
  del nieto): inofensivo, nadie las lee; mismo comportamiento que `GAMECLIP_CLIP_PATH`.

---

**Estado:** ✅ aprobado el 2026-10-09 (diseño del owner)
