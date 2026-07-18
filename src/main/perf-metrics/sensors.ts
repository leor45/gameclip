import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

// Wrapper del helper de sensores (gc-perf-sensors.exe, LibreHardwareMonitor sobre .NET Framework
// 4.8): un proceso persistente que emite UNA línea JSON por segundo con los sensores de GPU y la
// temperatura de CPU. Best-effort en todo: sin binario, sin sensor o con el proceso caído, las
// lecturas quedan en null y el overlay pinta «—».

/** Nombre del binario empaquetado en `resources/`. */
export const PERF_SENSORS_EXE = 'gc-perf-sensors.exe';

/** Lectura de sensores; null = ese sensor no está disponible en este hardware/permisos. */
export interface SensorReading {
  gpuUsage: number | null;
  gpuTemp: number | null;
  gpuFan: number | null;
  gpuVoltage: number | null;
  vramUsedMb: number | null;
  vramTotalMb: number | null;
  cpuTemp: number | null;
}

export const EMPTY_SENSOR_READING: SensorReading = {
  gpuUsage: null,
  gpuTemp: null,
  gpuFan: null,
  gpuVoltage: null,
  vramUsedMb: null,
  vramTotalMb: null,
  cpuTemp: null,
};

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Parsea una línea del helper; null si la línea no es JSON válido (se ignora sin romper nada). */
export function parseSensorsLine(line: string): SensorReading | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  return {
    gpuUsage: num(r.gpuUsage),
    gpuTemp: num(r.gpuTemp),
    gpuFan: num(r.gpuFan),
    gpuVoltage: num(r.gpuVoltage),
    vramUsedMb: num(r.vramUsedMb),
    vramTotalMb: num(r.vramTotalMb),
    cpuTemp: num(r.cpuTemp),
  };
}

/** Ruta del helper: `resources/` del paquete (empaquetado) o del repo (dev). null si no está. */
export function defaultSensorsPath(): string | null {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [
    resourcesPath ? join(resourcesPath, PERF_SENSORS_EXE) : null,
    join(process.cwd(), 'resources', PERF_SENSORS_EXE),
  ].filter((p): p is string => p !== null);
  return candidates.find((p) => existsSync(p)) ?? null;
}

/** Proceso hijo mínimo que el reader maneja (testeable sin procesos reales). */
export interface LineProcess {
  kill(): void;
  onLine(listener: (line: string) => void): void;
  onExit(listener: () => void): void;
}

export interface SensorsDeps {
  helperPath: () => string | null;
  spawn: (exePath: string) => LineProcess;
}

/**
 * Mantiene vivo el helper de sensores mientras haga falta y recuerda la última lectura. Si el
 * proceso muere no se relanza solo (evita un bucle de crashes: p. ej. sin .NET Framework);
 * `start()` tras un `stop()` sí vuelve a intentarlo.
 */
export class SensorsReader {
  private child: LineProcess | null = null;
  private reading: SensorReading = EMPTY_SENSOR_READING;
  private failed = false;

  constructor(private readonly deps: SensorsDeps) {}

  start(): void {
    if (this.child || this.failed) return;
    const exePath = this.deps.helperPath();
    if (!exePath) {
      this.failed = true; // sin binario: no insistir en cada tick
      return;
    }
    const child = this.deps.spawn(exePath);
    child.onLine((line) => {
      const parsed = parseSensorsLine(line);
      if (parsed) this.reading = parsed;
    });
    child.onExit(() => {
      if (this.child === child) {
        this.child = null;
        this.failed = true;
        this.reading = EMPTY_SENSOR_READING;
      }
    });
    this.child = child;
  }

  stop(): void {
    this.child?.kill();
    this.child = null;
    this.failed = false;
    this.reading = EMPTY_SENSOR_READING;
  }

  latest(): SensorReading {
    return this.reading;
  }
}

/** Spawn real con stdout por líneas. stdin 'pipe': el helper recibe EOF si GameClip muere. */
export function realSensorsSpawn(exePath: string): LineProcess {
  const child: ChildProcess = spawn(exePath, [], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const rl = child.stdout ? createInterface({ input: child.stdout }) : null;
  return {
    kill: () => {
      rl?.close();
      child.kill();
    },
    onLine: (listener) => rl?.on('line', listener),
    onExit: (listener) => child.on('exit', listener),
  };
}

export function createSensorsReader(): SensorsReader {
  return new SensorsReader({ helperPath: defaultSensorsPath, spawn: realSensorsSpawn });
}
