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
  /** Reloj inyectable para los reintentos (tests). */
  now?: () => number;
}

/** Espera antes de los primeros reintentos tras una muerte inesperada. */
const REINTENTO_MUERTE_MS = 5_000;
/** Reintentos rápidos antes de pasar a la cadencia lenta. */
const MAX_REINTENTOS = 3;
/**
 * Cadencia tras agotar los rápidos. **No se abandona del todo**, mismo criterio que el watchdog de
 * PresentMon: la causa de una muerte suele ser pasajera y rendirse dejaría las métricas de hardware
 * en «—» hasta reiniciar GameClip, sin que el usuario sepa por qué.
 */
const REINTENTO_LENTO_MS = 60_000;

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
 * Mantiene vivo el helper de sensores mientras haga falta y recuerda la última lectura.
 *
 * Si el proceso muere por su cuenta **se relanza solo**, con la espera escalonada de más abajo: no
 * en caliente (encadenaría arranques fallidos) pero tampoco nunca — antes, morir una vez dejaba las
 * siete métricas de hardware en «—» el resto de la sesión, en silencio y sin más salida que tocar
 * ajustes o reiniciar. Lo único que sigue siendo un fallo **permanente** es que falte el binario:
 * eso no se arregla esperando.
 */
export class SensorsReader {
  private child: LineProcess | null = null;
  private reading: SensorReading = EMPTY_SENSOR_READING;
  /** Fallo del que no se vuelve: hoy, solo «no está el .exe». */
  private failed = false;
  /** Modo con el que corre el helper actual, para saber si hay que relanzarlo. */
  private mode: SensorsMode | null = null;
  /** Cuándo murió por su cuenta, o null si está vivo (o parado a propósito). */
  private muertoEn: number | null = null;
  private reintentos = 0;
  private readonly now: () => number;

  constructor(private readonly deps: SensorsDeps) {
    this.now = deps.now ?? (() => Date.now());
  }

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
    if (this.muertoEn !== null) {
      // Murió y espera su reintento espaciado: no se adelanta aquí. Pero sí se apunta el modo nuevo,
      // porque si no volvería con el viejo (p. ej. con `--cpu` después de haberlo desmarcado).
      this.mode = mode;
      return;
    }
    if (this.child || this.failed) return;
    this.spawnChild(mode);
  }

  private spawnChild(mode: SensorsMode): void {
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
        this.muertoEn = this.now();
        // Aquí SÍ se limpia la lectura: la ventana de reintento puede durar un minuto, y enseñar
        // cifras de hace un minuto como si fueran de ahora es peor que un guion — el usuario no
        // puede distinguirlo. (Al relanzar por cambio de modo el hueco es de ~1 s y sí se conservan.)
        this.reading = EMPTY_SENSOR_READING;
      }
    });
    this.child = child;
  }

  /**
   * Relanza el helper si murió y ya toca. Se evalúa desde `latest()`, o sea una vez por tick del
   * sampler: no hace falta un `setInterval` que luego haya que apagar en `stop()` y en el cierre de
   * la app — justo el tipo de ciclo de vida que provocó el bug de la bandeja destruida al cerrar.
   */
  private reintentarSiMurio(): void {
    if (this.child || this.muertoEn === null || this.failed) return;
    const espera = this.reintentos < MAX_REINTENTOS ? REINTENTO_MUERTE_MS : REINTENTO_LENTO_MS;
    if (this.now() - this.muertoEn < espera) return;
    this.reintentos++;
    if (this.reintentos === MAX_REINTENTOS + 1) {
      // Solo al entrar en cadencia lenta: repetirlo cada minuto sería ruido en el log.
      console.warn(
        `[perf] el helper de sensores sigue cayéndose; se reintentará cada ${REINTENTO_LENTO_MS / 1000}s.`,
      );
    }
    this.muertoEn = null;
    this.spawnChild(this.mode ?? { cpu: false });
  }

  stop(): void {
    this.child?.kill();
    this.child = null;
    this.failed = false;
    this.mode = null;
    this.muertoEn = null;
    this.reintentos = 0;
    // Aquí sí se limpia: parar de verdad (overlay apagado) no debe dejar cifras viejas en pantalla.
    this.reading = EMPTY_SENSOR_READING;
  }

  latest(): SensorReading {
    this.reintentarSiMurio();
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
