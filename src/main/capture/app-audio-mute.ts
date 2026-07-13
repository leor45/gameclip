import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Wrapper del helper nativo gc-app-audio-mute: silencia la sesión de obs64.exe en el dispositivo del
// mando (DualSense) para que la vibración háptica —que el mando transporta como audio— no se cuele
// en la grabación. Ver spec/work/feature-silenciar-haptico-dualsense.

/** Nombre del binario nativo empaquetado en `resources/`. */
export const HAPTIC_MUTE_EXE = 'gc-app-audio-mute.exe';
/** Proceso backend de obs-studio-node cuya sesión de audio se silencia. */
export const OBS_PROCESS = 'obs64.exe';

// La sesión de obs64 en el dispositivo aparece un instante DESPUÉS de que la captura abra el stream,
// así que se reintenta un rato corto hasta encontrarla.
export const RETRY_INTERVAL_MS = 250;
export const RETRY_TIMEOUT_MS = 3000;

/** Código de salida del helper cuando aplicó el mute a al menos una sesión. */
const EXIT_OK = 0;

export type HapticMuteOutcome = 'applied' | 'skipped' | 'timeout';

export interface HapticMuteDeps {
  /** Ruta del helper, o null si el binario no está (no compilado / no empaquetado). */
  helperPath: () => string | null;
  /** Ejecuta el helper y resuelve con su código de salida (-1 si ni siquiera arrancó). */
  run: (exePath: string, args: string[]) => Promise<number>;
  wait: (ms: number) => Promise<void>;
  now: () => number;
}

/** Argumentos de la CLI del helper para silenciar `targetProcess` en el dispositivo `devicePattern`. */
export function buildArgs(devicePattern: string, targetProcess: string = OBS_PROCESS): string[] {
  return ['--device', devicePattern, '--process', targetProcess, '--mute'];
}

/**
 * Silencia la sesión de obs64.exe en el dispositivo del mando, reintentando hasta que exista o hasta
 * agotar el timeout. Best-effort por diseño: nunca lanza; un fallo solo significa que vuelve el
 * zumbido, nunca que se rompe la captura.
 *
 * Devuelve `skipped` si no hay binario o patrón, `applied` si el helper reportó éxito, `timeout` si
 * la sesión no apareció a tiempo.
 */
export async function applyHapticMute(
  devicePattern: string,
  deps: HapticMuteDeps,
): Promise<HapticMuteOutcome> {
  const exePath = deps.helperPath();
  const pattern = devicePattern.trim();
  if (!exePath || !pattern) return 'skipped';

  const args = buildArgs(pattern);
  const deadline = deps.now() + RETRY_TIMEOUT_MS;
  for (;;) {
    const code = await deps.run(exePath, args).catch(() => -1);
    if (code === EXIT_OK) return 'applied';
    if (deps.now() + RETRY_INTERVAL_MS > deadline) return 'timeout';
    await deps.wait(RETRY_INTERVAL_MS);
  }
}

/** Ejecuta el helper con execFile; resuelve con el exit code (-1 si no arrancó, p. ej. ENOENT). */
function execFileRun(exePath: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    execFile(exePath, args, { windowsHide: true, timeout: 5000 }, (err) => {
      if (!err) return resolve(EXIT_OK);
      const code = (err as NodeJS.ErrnoException & { code?: number | string }).code;
      resolve(typeof code === 'number' ? code : -1);
    });
  });
}

/** Busca el binario en `resources/` del paquete (empaquetado) o del repo (dev). null si no está. */
function defaultHelperPath(): string | null {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [
    resourcesPath ? join(resourcesPath, HAPTIC_MUTE_EXE) : null,
    join(process.cwd(), 'resources', HAPTIC_MUTE_EXE),
  ].filter((p): p is string => p !== null);
  return candidates.find((p) => existsSync(p)) ?? null;
}

/** Dependencias reales (producción). Los tests inyectan las suyas y no tocan esto. */
export function realHapticMuteDeps(): HapticMuteDeps {
  return {
    helperPath: defaultHelperPath,
    run: execFileRun,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
  };
}
