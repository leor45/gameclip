import { execFile, spawn } from 'node:child_process';

// Auto-inicio con privilegios de administrador: una tarea programada al logon con RunLevel
// HIGHEST. Es la única vía sin prompt UAC recurrente —la clave Run no puede elevar y un manifest
// requireAdministrator pediría UAC en cada arranque manual—. Crear/borrar la tarea sí exige
// elevación: se hace vía `Start-Process -Verb RunAs` (una confirmación UAC por cambio, no por
// arranque). Ver el plan de spec/work/feature-overlay-rendimiento.

export const ELEVATED_TASK_NAME = 'GameClipAutoStart';

/**
 * Línea de argumentos de schtasks para crear la tarea (idempotente con /F). Mismo cuidado que
 * auto-launch.ts: la ruta debe ser la REAL del portable (PORTABLE_EXECUTABLE_FILE), nunca la copia
 * de %TEMP%; eso lo garantiza el llamador pasando el exePath correcto.
 */
export function schtasksCreateArgs(exePath: string): string {
  // /TR lleva comillas internas escapadas (\") para que la ruta con espacios sobreviva.
  return `/Create /TN ${ELEVATED_TASK_NAME} /TR "\\"${exePath}\\" --hidden" /SC ONLOGON /RL HIGHEST /F`;
}

export function schtasksDeleteArgs(): string {
  return `/Delete /TN ${ELEVATED_TASK_NAME} /F`;
}

/**
 * Valor de un nodo del XML de schtasks tal como lo escribimos: entidades decodificadas, sin espacios
 * alrededor y sin el par de comillas que envuelve la ruta (schtasks la guarda entrecomillada, igual
 * que la pasa `schtasksCreateArgs`).
 */
function valorXml(raw: string | undefined): string {
  const texto = (raw ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
  return texto.length >= 2 && texto.startsWith('"') && texto.endsWith('"') ? texto.slice(1, -1) : texto;
}

/**
 * La tarea correcta tiene que lanzar exactamente el portable actual y arrancar en bandeja. La ruta se
 * compara sin comillas ni mayúsculas: antes se comparaba en crudo con la ruta sin comillas, la tarea
 * real nunca coincidía y se recreaba (elevando) en cada arranque.
 */
export function elevatedTaskMatches(taskXml: string | null, exePath: string): boolean {
  if (!taskXml) return false;
  const command = valorXml(taskXml.match(/<Command>([^<]*)<\/Command>/i)?.[1]);
  const arguments_ = valorXml(taskXml.match(/<Arguments>([^<]*)<\/Arguments>/i)?.[1]);
  return command.toLowerCase() === exePath.toLowerCase() && arguments_ === '--hidden';
}

/**
 * Argumentos de powershell.exe para correr schtasks elevado (UAC) y esperar su resultado.
 * `-Wait` propaga el fin y el exit code de schtasks. Si el usuario cancela el UAC, Start-Process
 * falla con un error **no terminante**: sin `-ErrorAction Stop` + `catch`, `$p` quedaba `$null` y
 * `exit $null` salía con 0, y el llamador daba por aplicado un cambio que no se hizo.
 *
 * La línea de schtasks (lleva la ruta del portable) NO se interpola en el script: viaja en una
 * variable de entorno del hijo (`GAMECLIP_SCHTASKS_ARGS`), como en «Copiar» (`export/clipboard.ts`).
 * PowerShell trata ‘ ’ ‚ ‛ como comillas simples, así que escapar solo la ' ASCII no bastaba: una
 * ruta con «Leo’s» cerraba la cadena antes de tiempo (ParserError), schtasks no corría y el ajuste
 * se revertía. `env` parte de `baseEnv` (PATH, SystemRoot… hacen falta para arrancar powershell).
 */
export function powershellElevatedArgs(
  schtasksArgLine: string,
  baseEnv: NodeJS.ProcessEnv = process.env,
): { args: string[]; env: NodeJS.ProcessEnv } {
  return {
    args: [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'try { $p = Start-Process -FilePath schtasks.exe -ArgumentList $env:GAMECLIP_SCHTASKS_ARGS -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ErrorAction Stop; exit $p.ExitCode } catch { exit 1 }',
    ],
    env: { ...baseEnv, GAMECLIP_SCHTASKS_ARGS: schtasksArgLine },
  };
}

export interface ElevatedLaunchDeps {
  /**
   * Corre powershell.exe con estos args y este entorno (la ruta viaja en él, no en el script);
   * resuelve true si terminó con exit code 0.
   */
  run: (args: string[], env: NodeJS.ProcessEnv) => Promise<boolean>;
  /** XML de la tarea actual; null si no existe o no se pudo consultar. */
  query?: () => Promise<string | null>;
}

export interface ElevationRelaunchDeps {
  isElevated: () => Promise<boolean>;
  relaunch: (exePath: string, appArgs: string[]) => Promise<boolean>;
}

/**
 * Alta/baja de la tarea programada. Sin caché de estado propio: el llamador solo invoca en un
 * CAMBIO del ajuste (nunca en cada arranque), para que el UAC aparezca solo al tocar el checkbox.
 */
export class ElevatedAutoLaunch {
  constructor(private readonly deps: ElevatedLaunchDeps) {}

  /** true si el cambio se aplicó; false si falló o el usuario canceló el UAC. */
  async setEnabled(enabled: boolean, exePath: string): Promise<boolean> {
    const argLine = enabled ? schtasksCreateArgs(exePath) : schtasksDeleteArgs();
    try {
      const { args, env } = powershellElevatedArgs(argLine);
      return await this.deps.run(args, env);
    } catch {
      return false;
    }
  }

  /** Repara la ruta tras actualizar el portable, sin UAC si la tarea ya es correcta. */
  async ensureEnabled(exePath: string): Promise<boolean> {
    try {
      const current = await this.deps.query?.();
      if (elevatedTaskMatches(current ?? null, exePath)) return true;
      return this.setEnabled(true, exePath);
    } catch {
      // No se eleva a ciegas si ni siquiera pudimos saber si la tarea existe.
      return false;
    }
  }
}

export class ElevationRelaunch {
  constructor(private readonly deps: ElevationRelaunchDeps) {}

  async isElevated(): Promise<boolean> {
    try {
      return await this.deps.isElevated();
    } catch {
      return false;
    }
  }

  async relaunch(exePath: string, appArgs: string[]): Promise<boolean> {
    try {
      return await this.deps.relaunch(exePath, appArgs);
    } catch {
      return false;
    }
  }
}

/**
 * Argumentos y entorno de powershell.exe para relanzar el portable real como administrador,
 * conservando flags como `--hidden`. Igual que `powershellElevatedArgs`, la ruta y los argumentos no
 * van en el script sino en variables de entorno del hijo (`GAMECLIP_RELAUNCH_EXE` y
 * `GAMECLIP_RELAUNCH_ARG_0…n`): el script no depende de ‘ ’ ‚ ‛ ni de ningún otro carácter del dato.
 * `-ArgumentList` sigue siendo un array de cadenas, como cuando eran literales.
 */
export function powershellRelaunchElevatedArgs(
  exePath: string,
  appArgs: string[],
  baseEnv: NodeJS.ProcessEnv = process.env,
): { args: string[]; env: NodeJS.ProcessEnv } {
  const env: NodeJS.ProcessEnv = { ...baseEnv, GAMECLIP_RELAUNCH_EXE: exePath };
  appArgs.forEach((arg, i) => {
    env[`GAMECLIP_RELAUNCH_ARG_${i}`] = arg;
  });
  const argList = appArgs.length
    ? ` -ArgumentList @(${appArgs.map((_, i) => `$env:GAMECLIP_RELAUNCH_ARG_${i}`).join(', ')})`
    : '';
  return {
    args: [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `try { Start-Process -FilePath $env:GAMECLIP_RELAUNCH_EXE${argList} -Verb RunAs; exit 0 } catch { exit 1 }`,
    ],
    env,
  };
}

function queryTask(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    execFile(
      'schtasks.exe',
      ['/Query', '/TN', ELEVATED_TASK_NAME, '/XML'],
      { windowsHide: true },
      (error, stdout) => {
        // schtasks usa 1 cuando la tarea no existe; eso sí se repara. Cualquier otro fallo (política,
        // permisos, binario ausente) se propaga para evitar un prompt UAC inútil en cada arranque.
        if (!error) resolve(stdout);
        else if (error.code === 1) resolve(null);
        else reject(error);
      },
    );
  });
}

function realRun(args: string[], env: NodeJS.ProcessEnv): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('powershell.exe', args, { windowsHide: true, stdio: 'ignore', env });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

function realIsElevated(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = execFile('net.exe', ['session'], { windowsHide: true }, (error) =>
      resolve(!error),
    );
    child.on('error', () => resolve(false));
  });
}

function realRelaunch(exePath: string, appArgs: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const { args, env } = powershellRelaunchElevatedArgs(exePath, appArgs);
    const child = spawn('powershell.exe', args, { windowsHide: true, stdio: 'ignore', env });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

export function createElevatedAutoLaunch(): ElevatedAutoLaunch {
  return new ElevatedAutoLaunch({ run: realRun, query: queryTask });
}

export function createElevationRelaunch(): ElevationRelaunch {
  return new ElevationRelaunch({ isElevated: realIsElevated, relaunch: realRelaunch });
}
