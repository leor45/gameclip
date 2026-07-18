import { EventEmitter } from 'node:events';
import os from 'node:os';
import type { PerfMetricsEnabled, PerfSnapshot } from '@shared/perf';
import { EMPTY_PERF_SNAPSHOT } from '@shared/perf';
import { cpuTimesFrom, cpuUsageBetween, ramMb, type CpuTimes } from './cpu';
import type { SensorsReader } from './sensors';
import type { PresentMonReader } from './presentmon';

const INTERVAL_MS = 1000;

/** Métricas que salen del helper de sensores: si ninguna está marcada, el helper ni se lanza. */
function needsSensors(metrics: PerfMetricsEnabled): boolean {
  return (
    metrics.gpuUsage ||
    metrics.gpuTemp ||
    metrics.gpuFan ||
    metrics.gpuVoltage ||
    metrics.vram ||
    metrics.cpuTemp
  );
}

export interface PerfSamplerDeps {
  sensors: Pick<SensorsReader, 'start' | 'stop' | 'latest'>;
  presentMon: Pick<PresentMonReader, 'start' | 'stop' | 'fps' | 'setDetectedGame'>;
  /** Fuente de datos de os, inyectable en tests. */
  osApi?: {
    cpus: () => ReturnType<typeof os.cpus>;
    totalmem: () => number;
    freemem: () => number;
  };
  intervalMs?: number;
}

/**
 * Orquesta las fuentes de métricas y emite un `snapshot` (PerfSnapshot) por segundo, solo con las
 * métricas marcadas (el resto va en null: no se mide lo que no se muestra). Los helpers viven solo
 * mientras alguna métrica suya esté marcada y el sampler corriendo.
 */
export class PerfSampler extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private metrics: PerfMetricsEnabled | null = null;
  private prevCpu: CpuTimes | null = null;
  private readonly osApi: NonNullable<PerfSamplerDeps['osApi']>;
  private readonly intervalMs: number;

  constructor(private readonly deps: PerfSamplerDeps) {
    super();
    this.osApi = deps.osApi ?? {
      cpus: () => os.cpus(),
      totalmem: () => os.totalmem(),
      freemem: () => os.freemem(),
    };
    this.intervalMs = deps.intervalMs ?? INTERVAL_MS;
  }

  /**
   * Ejecutable del juego que la app tiene detectado (o null). Es una **segunda vía** para calificar
   * un proceso de cara a los FPS —cubre el emulador que corre en ventana normal—, nunca un
   * requisito: los FPS siguen funcionando con juegos que la app no reconoce. No revive el
   * `setGameExe` que la Fase 19 quitó, que sí era un requisito. Ver `presentmon.ts`.
   */
  setDetectedGame(exe: string | null): void {
    this.deps.presentMon.setDetectedGame(exe);
  }

  /** Estado deseado: null apaga todo (overlay desactivado). Idempotente. */
  configure(metrics: PerfMetricsEnabled | null): void {
    this.metrics = metrics;
    if (!metrics) {
      this.stopAll();
      return;
    }
    // Dos preguntas distintas, a propósito: `needsSensors` decide **si** hace falta el helper, y
    // `cpuTemp` decide **en qué modo**. Solo esa métrica necesita el grupo de CPU (los MSR, anillo 0
    // vía PawnIO); lo de GPU va por NVAPI/ADL, que no usa driver. Quien no la marcó no debe provocar
    // la carga de un driver de kernel.
    if (needsSensors(metrics)) this.deps.sensors.start({ cpu: metrics.cpuTemp });
    else this.deps.sensors.stop();
    // PresentMon captura TODOS los procesos: no depende del juego detectado, así que basta con
    // encenderlo mientras la métrica de FPS esté marcada.
    if (metrics.fps) this.deps.presentMon.start();
    else this.deps.presentMon.stop();
    if (!this.timer) {
      this.prevCpu = null;
      this.timer = setInterval(() => this.tick(), this.intervalMs);
    }
  }

  stop(): void {
    this.metrics = null;
    this.stopAll();
  }

  /** Un tick de muestreo (expuesto para tests síncronos). */
  tick(): void {
    const m = this.metrics;
    if (!m) return;
    const snapshot: PerfSnapshot = { ...EMPTY_PERF_SNAPSHOT };

    if (m.cpuUsage) {
      const times = cpuTimesFrom(this.osApi.cpus());
      snapshot.cpuUsage = cpuUsageBetween(this.prevCpu, times);
      this.prevCpu = times;
    }
    if (m.ram) {
      const ram = ramMb(this.osApi.totalmem(), this.osApi.freemem());
      snapshot.ramUsedMb = ram.usedMb;
      snapshot.ramTotalMb = ram.totalMb;
    }
    const sensores = this.deps.sensors.latest();
    if (m.gpuUsage) snapshot.gpuUsage = sensores.gpuUsage;
    if (m.gpuTemp) snapshot.gpuTemp = sensores.gpuTemp;
    if (m.gpuFan) snapshot.gpuFan = sensores.gpuFan;
    if (m.gpuVoltage) snapshot.gpuVoltage = sensores.gpuVoltage;
    if (m.vram) {
      snapshot.vramUsedMb = sensores.vramUsedMb;
      snapshot.vramTotalMb = sensores.vramTotalMb;
    }
    if (m.cpuTemp) snapshot.cpuTemp = sensores.cpuTemp;
    if (m.fps) snapshot.fps = this.deps.presentMon.fps();

    this.emit('snapshot', snapshot);
  }

  private stopAll(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.prevCpu = null;
    this.deps.sensors.stop();
    this.deps.presentMon.stop();
  }
}
