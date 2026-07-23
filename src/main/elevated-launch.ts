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

/** La tarea correcta tiene que lanzar exactamente el portable actual y arrancar en bandeja. */
export function elevatedTaskMatches(taskXml: string | null, exePath: string): boolean {
  if (!taskXml) return false;
  const command = taskXml.match(/<Command>([^<]*)<\/Command>/i)?.[1];
  const arguments_ = taskXml.match(/<Arguments>([^<]*)<\/Arguments>/i)?.[1];
  return command === exePath && arguments_ === '--hidden';
}

/**
 * Argumentos de powershell.exe para correr schtasks elevado (UAC) y esperar su resultado.
 * `-Wait` propaga el fin; si el usuario cancela el UAC, Start-Process lanza y el exit code de
 * PowerShell deja de ser 0 — así el llamador sabe que NO se aplicó.
 */
export function powershellElevatedArgs(schtasksArgLine: string): string[] {
  const escaped = schtasksArgLine.replace(/'/g, "''");
  return [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `$p = Start-Process -FilePath schtasks.exe -ArgumentList '${escaped}' -Verb RunAs -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode`,
  ];
}

export interface ElevatedLaunchDeps {
  /** Corre powershell.exe con estos args; resuelve true si terminó con exit code 0. */
  run: (args: string[]) => Promise<boolean>;
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
      return await this.deps.run(powershellElevatedArgs(argLine));
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

function psSingle(value: string): string {
  return value.replace(/'/g, "''");
}

/** Argumentos para relanzar el portable real como administrador, conservando flags como `--hidden`. */
export function powershellRelaunchElevatedArgs(exePath: string, appArgs: string[]): string[] {
  const file = psSingle(exePath);
  const args = appArgs.map((arg) => `'${psSingle(arg)}'`).join(', ');
  const argList = appArgs.length ? ` -ArgumentList @(${args})` : '';
  return [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `try { Start-Process -FilePath '${file}'${argList} -Verb RunAs; exit 0 } catch { exit 1 }`,
  ];
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

function realRun(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('powershell.exe', args, { windowsHide: true, stdio: 'ignore' });
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
    const child = spawn('powershell.exe', powershellRelaunchElevatedArgs(exePath, appArgs), {
      windowsHide: true,
      stdio: 'ignore',
    });
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
