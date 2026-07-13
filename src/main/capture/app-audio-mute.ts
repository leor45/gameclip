import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Gestión del helper nativo gc-app-audio-mute en modo `--watch`: un proceso persistente que escucha
// eventos de Core Audio y mutea la sesión de obs64.exe en el dispositivo del mando (DualSense) EN
// CUANTO aparece —la sesión no se crea hasta que el mando emite audio (al pulsar un botón)—, y
// re-escanea si se conecta un mando nuevo. Ver spec/work/fix-haptico-dualsense-event-driven.

/** Nombre del binario nativo empaquetado en `resources/`. */
export const HAPTIC_MUTE_EXE = 'gc-app-audio-mute.exe';
/** Proceso backend de obs-studio-node cuya sesión de audio se silencia. */
export const OBS_PROCESS = 'obs64.exe';

/** Argumentos del helper para vigilar (`--watch`) `targetProcess` en el dispositivo `devicePattern`. */
export function buildArgs(devicePattern: string, targetProcess: string = OBS_PROCESS): string[] {
  return ['--device', devicePattern, '--process', targetProcess, '--watch'];
}

/** Ruta del helper: `resources/` del paquete (empaquetado) o del repo (dev). null si no está. */
export function defaultHelperPath(): string | null {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [
    resourcesPath ? join(resourcesPath, HAPTIC_MUTE_EXE) : null,
    join(process.cwd(), 'resources', HAPTIC_MUTE_EXE),
  ].filter((p): p is string => p !== null);
  return candidates.find((p) => existsSync(p)) ?? null;
}

/** Proceso hijo mínimo que el listener necesita manejar (subconjunto de ChildProcess, testeable). */
export interface SpawnedProcess {
  kill(): void;
  on(event: 'exit', listener: () => void): void;
}

export interface HapticMuteDeps {
  /** Ruta del helper, o null si el binario no está (no compilado / no empaquetado). */
  helperPath: () => string | null;
  /** Lanza el helper en modo watch; el proceso vive hasta que se le mata o se cierra su stdin. */
  spawn: (exePath: string, args: string[]) => SpawnedProcess;
}

/**
 * Mantiene vivo el listener nativo según el estado deseado (activado + patrón de dispositivo).
 * `apply` es idempotente: arranca, para o reinicia el proceso comparando el estado deseado con el
 * vigente, así se puede llamar en el init y en cada cambio de ajustes sin duplicar procesos.
 * Best-effort: si no hay binario, es un no-op silencioso.
 */
export class HapticMuteListener {
  private child: SpawnedProcess | null = null;
  /** Patrón con el que se lanzó el proceso vivo (null si no hay proceso). */
  private runningPattern: string | null = null;

  constructor(private readonly deps: HapticMuteDeps) {}

  /** Reconcilia el proceso con el estado deseado. */
  apply(enabled: boolean, devicePattern: string): void {
    const pattern = devicePattern.trim();
    const wanted = enabled && pattern ? pattern : null;

    if (this.runningPattern === wanted) return; // ya en el estado deseado (o ambos apagados)
    this.stop();
    if (wanted === null) return;

    const exePath = this.deps.helperPath();
    if (!exePath) return; // sin binario: no-op

    const child = this.deps.spawn(exePath, buildArgs(wanted));
    // Si el proceso muere por su cuenta, olvidarlo para que un `apply` posterior lo relance.
    child.on('exit', () => {
      if (this.child === child) {
        this.child = null;
        this.runningPattern = null;
      }
    });
    this.child = child;
    this.runningPattern = wanted;
  }

  /** Mata el listener si está vivo (cierre de la app o desactivación). */
  stop(): void {
    if (!this.child) return;
    this.child.kill();
    this.child = null;
    this.runningPattern = null;
  }
}

/** Spawn real, envuelto en el subconjunto SpawnedProcess. stdin 'pipe' para que el helper reciba
 *  EOF al matarlo o al cerrar GameClip (sin huérfano). */
function realSpawn(exePath: string, args: string[]): SpawnedProcess {
  const child: ChildProcess = spawn(exePath, args, {
    windowsHide: true,
    stdio: ['pipe', 'ignore', 'ignore'],
  });
  return {
    kill: () => {
      child.kill();
    },
    on: (event, listener) => {
      child.on(event, listener);
    },
  };
}

/** Dependencias reales (producción). Los tests inyectan las suyas y no tocan esto. */
export function realHapticMuteDeps(): HapticMuteDeps {
  return { helperPath: defaultHelperPath, spawn: realSpawn };
}

/** Listener con las dependencias reales, listo para el manager. */
export function createHapticMuteListener(): HapticMuteListener {
  return new HapticMuteListener(realHapticMuteDeps());
}
