import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { LineProcess } from './sensors';

// Wrapper de PresentMon (Intel, MIT): mide los FPS reales del juego leyendo por ETW los eventos
// Present de su proceso — vale para cualquier app que presente frames (emuladores incluidos).
// Requiere admin (o pertenecer a "Performance Log Users"); sin permisos el proceso muere enseguida
// y los FPS quedan en null, que el overlay pinta como «—».

/** Nombre del binario empaquetado en `resources/`. */
export const PRESENTMON_EXE = 'gc-presentmon.exe';

/** Ventana de la media: FPS = presents de los últimos ~1000 ms. */
const FPS_WINDOW_MS = 1000;
/** Sin presents en este margen (juego en menú parado, tracker muerto) → null, no un FPS viejo. */
const STALE_MS = 3000;

/**
 * Argumentos para seguir a un proceso por nombre de ejecutable. `-output_stdout` da el CSV por
 * stdout; `-stop_existing_session` limpia una sesión ETW huérfana de un cierre sucio anterior. Sin
 * elevación PresentMon NO se relanza como admin por su cuenta (eso es opt-in con
 * `-restart_as_admin`, que no se pasa): simplemente falla y GameClip degrada los FPS a «—».
 */
export function presentMonArgs(processName: string): string[] {
  return [
    '-process_name', processName,
    '-output_stdout',
    '-stop_existing_session',
    '-session_name', 'GameClipPerf',
  ];
}

/** Índice de la columna msBetweenPresents en la cabecera CSV; null si no está (versión rara). */
export function msBetweenPresentsIndex(headerLine: string): number | null {
  const idx = headerLine
    .split(',')
    .findIndex((col) => col.trim().toLowerCase() === 'msbetweenpresents');
  return idx >= 0 ? idx : null;
}

/** Valor numérico de una columna de una línea CSV; null si no parsea. */
export function csvNumberAt(line: string, index: number): number | null {
  const value = Number(line.split(',')[index]);
  return Number.isFinite(value) ? value : null;
}

/**
 * FPS a partir de los intervalos entre presents: media de los que caen en la ventana. Separado del
 * proceso para poder testearlo con tiempos falsos.
 */
export class FpsTracker {
  private samples: { at: number; ms: number }[] = [];

  push(msBetweenPresents: number, now: number): void {
    if (msBetweenPresents <= 0) return;
    this.samples.push({ at: now, ms: msBetweenPresents });
    // La ventana acota la memoria: a 500 fps son ~500 muestras vivas.
    const corte = now - FPS_WINDOW_MS;
    while (this.samples.length && this.samples[0].at < corte) this.samples.shift();
  }

  fps(now: number): number | null {
    const last = this.samples[this.samples.length - 1];
    if (!last || now - last.at > STALE_MS) return null;
    const vivos = this.samples.filter((s) => s.at >= now - FPS_WINDOW_MS);
    if (!vivos.length) return null;
    const media = vivos.reduce((acc, s) => acc + s.ms, 0) / vivos.length;
    return media > 0 ? 1000 / media : null;
  }
}

/** Ruta del binario: `resources/` del paquete (empaquetado) o del repo (dev). null si no está. */
export function defaultPresentMonPath(): string | null {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [
    resourcesPath ? join(resourcesPath, PRESENTMON_EXE) : null,
    join(process.cwd(), 'resources', PRESENTMON_EXE),
  ].filter((p): p is string => p !== null);
  return candidates.find((p) => existsSync(p)) ?? null;
}

export interface PresentMonDeps {
  helperPath: () => string | null;
  spawn: (exePath: string, args: string[]) => LineProcess;
  now?: () => number;
}

/**
 * Sigue al juego activo: un proceso PresentMon por ejecutable. Si el proceso muere (sin permisos,
 * juego cerrado) no se relanza para ese mismo ejecutable —evita un bucle de reintentos— pero un
 * juego nuevo vuelve a intentarlo.
 */
export class PresentMonReader {
  private child: LineProcess | null = null;
  private tracker = new FpsTracker();
  /** Ejecutable vigilado por el proceso vivo, o del último intento fallido. */
  private target: string | null = null;
  private failedTarget: string | null = null;
  private msIndex: number | null = null;
  private readonly now: () => number;

  constructor(private readonly deps: PresentMonDeps) {
    this.now = deps.now ?? (() => Date.now());
  }

  /** Ejecutable del juego activo (cs2.exe) o null si no hay juego. Idempotente. */
  setTarget(processName: string | null): void {
    const wanted = processName?.trim() || null;
    if (wanted === this.target) return;
    this.stopChild();
    this.target = wanted;
    this.tracker = new FpsTracker();
    if (!wanted || this.failedTarget === wanted) return;

    const exePath = this.deps.helperPath();
    if (!exePath) {
      this.failedTarget = wanted;
      return;
    }
    const child = this.deps.spawn(exePath, presentMonArgs(wanted));
    this.msIndex = null;
    child.onLine((line) => {
      if (this.msIndex === null) {
        this.msIndex = msBetweenPresentsIndex(line);
        return;
      }
      const ms = csvNumberAt(line, this.msIndex);
      if (ms !== null) this.tracker.push(ms, this.now());
    });
    child.onExit(() => {
      if (this.child === child) {
        this.child = null;
        // Muerte temprana = sin permisos o exe incompatible: no reintentar para este target.
        this.failedTarget = this.target;
      }
    });
    this.child = child;
  }

  fps(): number | null {
    return this.tracker.fps(this.now());
  }

  stop(): void {
    this.stopChild();
    this.target = null;
    this.failedTarget = null;
    this.tracker = new FpsTracker();
  }

  private stopChild(): void {
    this.child?.kill();
    this.child = null;
  }
}

/** Spawn real con stdout por líneas (mismo contrato que el helper de sensores). */
export function realPresentMonSpawn(exePath: string, args: string[]): LineProcess {
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

export function createPresentMonReader(): PresentMonReader {
  return new PresentMonReader({ helperPath: defaultPresentMonPath, spawn: realPresentMonSpawn });
}
