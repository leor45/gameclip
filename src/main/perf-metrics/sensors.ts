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
  spawn: (exePath: string, args: string[]) => LineProcess;
}

/**
 * Argumento que pide al helper abrir **también** el grupo de CPU. Es opt-in a propósito: la
 * temperatura del procesador se lee de los MSR (anillo 0) y eso es lo que engancha PawnIO, así que
 * el modo por defecto tiene que ser el que **no** lo toca. Si algún día se olvida pasar la bandera,
 * el fallo degrada a «no se lee la temperatura» y nunca a «se carga un driver de kernel de más».
 */
const ARG_CPU = '--cpu';

/** Qué grupos de sensores se le piden al helper. El de GPU (NVAPI/ADL) va siempre: no usa driver. */
export interface SensorsMode {
  /** Abrir el grupo de CPU. Solo cuando el usuario marcó «Temperatura de CPU». */
  cpu: boolean;
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
  /** Modo con el que corre el helper actual, para saber si hay que relanzarlo. */
  private mode: SensorsMode | null = null;

  constructor(private readonly deps: SensorsDeps) {}

  start(mode: SensorsMode = { cpu: false }): void {
    // Cambiar de modo obliga a relanzar: los grupos se eligen al abrir el helper y no se reconfiguran
    // en caliente. Es barato porque solo ocurre cuando el usuario toca un checkbox en Ajustes
    // (`configure()` se llama al arrancar y desde `settings:changed`, nunca por tick).
    if (this.child && this.mode && this.mode.cpu !== mode.cpu) {
      // Se conserva la última lectura a propósito: relanzar tarda ~1 s en dar la primera muestra y
      // limpiarla haría parpadear a «—» las métricas de GPU, que no tienen nada que ver con el
      // checkbox que se acaba de tocar. Un valor de hace un segundo informa mejor que un guion.
      this.child.kill();
      this.child = null;
      this.failed = false; // el cambio es una acción del usuario: merece un intento nuevo
    }
    if (this.child || this.failed) return;
    const exePath = this.deps.helperPath();
    if (!exePath) {
      this.failed = true; // sin binario: no insistir en cada tick
      return;
    }
    this.mode = mode;
    const child = this.deps.spawn(exePath, mode.cpu ? [ARG_CPU] : []);
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
    this.mode = null;
    // Aquí sí se limpia: parar de verdad (overlay apagado) no debe dejar cifras viejas en pantalla.
    this.reading = EMPTY_SENSOR_READING;
  }

  latest(): SensorReading {
    return this.reading;
  }
}

/** Spawn real con stdout por líneas. stdin 'pipe': el helper recibe EOF si GameClip muere. */
export function realSensorsSpawn(exePath: string, args: string[] = []): LineProcess {
  const child: ChildProcess = spawn(exePath, args, {
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
