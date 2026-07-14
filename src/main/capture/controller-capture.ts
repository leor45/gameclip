import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Gestión del helper nativo gc-controller-listen: un proceso persistente que escucha el botón de
// captura de los mandos (Create del DualSense por HID, Compartir del Xbox por GameInput) y escribe
// una línea `capture` por stdout en cada pulsación. Este wrapper lo arranca/para según el ajuste y
// traduce cada `capture` en el callback (guardar clip). Ver spec/work/feature-boton-captura-mandos.

/** Nombre del binario nativo empaquetado en `resources/`. */
export const CONTROLLER_LISTEN_EXE = 'gc-controller-listen.exe';
/** Línea que el helper emite por stdout en cada pulsación del botón de captura. */
export const CAPTURE_LINE = 'capture';

/** Ruta del helper: `resources/` del paquete (empaquetado) o del repo (dev). null si no está. */
export function defaultHelperPath(): string | null {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [
    resourcesPath ? join(resourcesPath, CONTROLLER_LISTEN_EXE) : null,
    join(process.cwd(), 'resources', CONTROLLER_LISTEN_EXE),
  ].filter((p): p is string => p !== null);
  return candidates.find((p) => existsSync(p)) ?? null;
}

/** Proceso hijo mínimo que el listener necesita manejar (subconjunto de ChildProcess, testeable). */
export interface SpawnedProcess {
  kill(): void;
  on(event: 'exit', listener: () => void): void;
  /** Registra un consumidor de líneas de stdout del helper (ya troceadas por `\n`). */
  onLine(listener: (line: string) => void): void;
}

export interface ControllerCaptureDeps {
  /** Ruta del helper, o null si el binario no está (no compilado / no empaquetado). */
  helperPath: () => string | null;
  /** Lanza el helper; el proceso vive hasta que se le mata o se cierra su stdin. */
  spawn: (exePath: string) => SpawnedProcess;
}

/**
 * Mantiene vivo el listener nativo según el estado deseado (activado o no). `apply` es idempotente:
 * arranca o para el proceso comparando el estado deseado con el vigente, y guarda siempre el callback
 * más reciente (el manager pasa un cierre nuevo cada vez, pero equivalente). Cada línea `capture` del
 * helper dispara `onCapture`. Best-effort: si no hay binario, es un no-op silencioso.
 */
export class ControllerCaptureListener {
  private child: SpawnedProcess | null = null;
  /** Último callback recibido en `apply`; se invoca en cada pulsación. */
  private onCapture: (() => void) | null = null;

  constructor(private readonly deps: ControllerCaptureDeps) {}

  /** Reconcilia el proceso con el estado deseado; `onCapture` se dispara en cada pulsación. */
  apply(enabled: boolean, onCapture: () => void): void {
    this.onCapture = onCapture; // guardar siempre el callback más reciente
    const isRunning = this.child !== null;
    if (enabled === isRunning) return; // ya en el estado deseado

    if (!enabled) {
      this.stop();
      return;
    }

    const exePath = this.deps.helperPath();
    if (!exePath) return; // sin binario: no-op

    const child = this.deps.spawn(exePath);
    // Si el proceso muere por su cuenta, olvidarlo para que un `apply` posterior lo relance.
    child.on('exit', () => {
      if (this.child === child) this.child = null;
    });
    child.onLine((line) => {
      if (line.trim() === CAPTURE_LINE) this.onCapture?.();
    });
    this.child = child;
  }

  /** Mata el listener si está vivo (cierre de la app o desactivación). */
  stop(): void {
    if (!this.child) return;
    this.child.kill();
    this.child = null;
  }
}

/** Spawn real: trocea stdout en líneas y las entrega a `onLine`. stdin 'pipe' para que el helper
 *  reciba EOF al matarlo o al cerrar GameClip (sin huérfano). */
function realSpawn(exePath: string): SpawnedProcess {
  const child: ChildProcess = spawn(exePath, [], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const lineListeners: ((line: string) => void)[] = [];
  let buffer = '';
  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => {
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).replace(/\r$/, '');
      buffer = buffer.slice(nl + 1);
      for (const listener of lineListeners) listener(line);
    }
  });
  return {
    kill: () => {
      child.kill();
    },
    on: (event, listener) => {
      child.on(event, listener);
    },
    onLine: (listener) => {
      lineListeners.push(listener);
    },
  };
}

/** Dependencias reales (producción). Los tests inyectan las suyas y no tocan esto. */
export function realControllerCaptureDeps(): ControllerCaptureDeps {
  return { helperPath: defaultHelperPath, spawn: realSpawn };
}

/** Listener con las dependencias reales, listo para el manager. */
export function createControllerCaptureListener(): ControllerCaptureListener {
  return new ControllerCaptureListener(realControllerCaptureDeps());
}
