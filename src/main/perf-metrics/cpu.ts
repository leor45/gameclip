// Uso de CPU y RAM vía node:os. Puro sobre los datos (los tests inyectan tiempos falsos): el uso
// de CPU es el delta de tiempos no-idle entre dos muestras, como hace el Administrador de tareas.

import type { CpuInfo } from 'node:os';

/** Acumulados de todos los cores en un instante. */
export interface CpuTimes {
  idle: number;
  total: number;
}

export function cpuTimesFrom(cpus: Pick<CpuInfo, 'times'>[]): CpuTimes {
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    for (const value of Object.values(cpu.times)) total += value;
  }
  return { idle, total };
}

/**
 * Uso de CPU 0–100 entre dos muestras; null si aún no hay delta (primera muestra) o si los datos
 * no avanzan (contadores congelados).
 */
export function cpuUsageBetween(prev: CpuTimes | null, next: CpuTimes): number | null {
  if (!prev) return null;
  const total = next.total - prev.total;
  if (total <= 0) return null;
  const idle = next.idle - prev.idle;
  const usage = ((total - idle) / total) * 100;
  return Math.min(100, Math.max(0, usage));
}

/** RAM usada/total en MB a partir de los bytes de os.totalmem()/os.freemem(). */
export function ramMb(totalBytes: number, freeBytes: number): { usedMb: number; totalMb: number } {
  const totalMb = totalBytes / (1024 * 1024);
  return { usedMb: Math.max(0, totalMb - freeBytes / (1024 * 1024)), totalMb };
}
