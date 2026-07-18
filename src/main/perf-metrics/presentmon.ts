import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline';
import type { LineProcess } from './sensors';

// Wrapper de PresentMon (Intel, MIT): mide los FPS reales leyendo por ETW los eventos Present. Corre
// en modo -captureall (todos los procesos) y mantiene un contador por proceso; el overlay muestra
// los FPS del proceso "enganchado" (el juego) mientras siga presentando, y si deja de hacerlo salta
// al de mayor tasa. Así los FPS no dependen de la detección de juegos ni se pierden al pasar la app
// a segundo plano (mientras siga presentando). Los frames generados por multiplicadores (DLSS/FSR
// Frame Generation) cuentan solos: se presentan por el swap chain, así que entran en msBetweenPresents.
//
// Requiere admin (sesión ETW); sin permisos el proceso muere enseguida y los FPS quedan en null.

/** Nombre del binario empaquetado en `resources/`. */
export const PRESENTMON_EXE = 'gc-presentmon.exe';

/** Ventana de la media: FPS = presents de los últimos ~1000 ms. */
const FPS_WINDOW_MS = 1000;
/** Sin presents en este margen, un proceso deja de considerarse "presentando". */
const STALE_MS = 2000;
/** Proceso sin muestras en este margen: se olvida (poda del mapa). */
const PRUNE_MS = 5000;

// Procesos que nunca son "el juego": el compositor de Windows y (se añade en runtime) la propia
// GameClip. El overlay y la ventana de la app presentan frames pero no son lo que el usuario mide.
const DENYLIST_BASE = ['dwm.exe'];

/**
 * Argumentos para capturar todos los procesos por stdout. `-captureall` es el modo por defecto pero
 * se explicita; `-exclude` quita el compositor y GameClip; `-stop_existing_session` limpia una
 * sesión ETW huérfana de un cierre sucio. Sin elevación PresentMon NO se relanza como admin por su
 * cuenta (eso es opt-in con `-restart_as_admin`, que no se pasa): falla y GameClip degrada a «—».
 */
export function presentMonArgs(excludeExe: string[]): string[] {
  const args = [
    '-captureall',
    '-output_stdout',
    // Sin esto PresentMon puede pintar su vista de swap chains por la misma salida y ensuciar el CSV.
    '-no_top',
    '-stop_existing_session',
    '-session_name', 'GameClipPerf',
  ];
  for (const exe of excludeExe) args.push('-exclude', exe);
  return args;
}

/** Índice de columnas de la cabecera CSV que nos interesan; null si falta alguna. */
export interface CsvColumns {
  application: number;
  msBetweenPresents: number;
}

export function parseCsvHeader(headerLine: string): CsvColumns | null {
  const cols = headerLine.split(',').map((c) => c.trim().toLowerCase());
  const application = cols.indexOf('application');
  const msBetweenPresents = cols.indexOf('msbetweenpresents');
  if (application < 0 || msBetweenPresents < 0) return null;
  return { application, msBetweenPresents };
}

/** Valor numérico de una columna de una línea CSV; null si no parsea. */
export function csvNumberAt(cells: string[], index: number): number | null {
  const value = Number(cells[index]);
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
    const corte = now - FPS_WINDOW_MS;
    while (this.samples.length && this.samples[0].at < corte) this.samples.shift();
  }

  /** Instante del último present (para saber si el proceso sigue vivo / podar). */
  lastAt(): number {
    const last = this.samples[this.samples.length - 1];
    return last ? last.at : Number.NEGATIVE_INFINITY;
  }

  /** FPS de la ventana, o null si no hay presents frescos. */
  fps(now: number): number | null {
    if (now - this.lastAt() > STALE_MS) return null;
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
  /** Ejecutable de la propia GameClip a excluir; default el basename de process.execPath. */
  selfExe?: () => string;
  now?: () => number;
}

/**
 * Corre PresentMon en modo captura-todo y expone los FPS del proceso enganchado. Un solo proceso
 * mientras la métrica FPS esté activa: `start()` lo lanza, `stop()` lo mata. Si el proceso muere
 * (sin permisos, cierre) no se relanza solo (evita un bucle de crashes); `stop()`+`start()` reintenta.
 */
export class PresentMonReader {
  private child: LineProcess | null = null;
  private cols: CsvColumns | null = null;
  private failed = false;
  /** exe (lowercase) → tracker de FPS. */
  private trackers = new Map<string, FpsTracker>();
  private denylist: Set<string>;
  /** Proceso cuyos FPS se muestran; se mantiene mientras presente. */
  private locked: string | null = null;
  private readonly now: () => number;

  constructor(private readonly deps: PresentMonDeps) {
    this.now = deps.now ?? (() => Date.now());
    const self = (deps.selfExe ?? (() => basename(process.execPath)))().toLowerCase();
    this.denylist = new Set([...DENYLIST_BASE, self]);
  }

  start(): void {
    if (this.child || this.failed) return;
    const exePath = this.deps.helperPath();
    if (!exePath) {
      this.failed = true;
      return;
    }
    const exclude = [...this.denylist];
    const child = this.deps.spawn(exePath, presentMonArgs(exclude));
    this.cols = null;
    child.onLine((line) => this.onLine(line));
    child.onExit(() => {
      if (this.child === child) {
        this.child = null;
        this.failed = true; // muerte temprana = sin permisos: no reintentar hasta stop()+start()
        this.trackers.clear();
        this.locked = null;
      }
    });
    this.child = child;
  }

  stop(): void {
    this.child?.kill();
    this.child = null;
    this.failed = false;
    this.cols = null;
    this.trackers.clear();
    this.locked = null;
  }

  private onLine(line: string): void {
    if (!this.cols) {
      this.cols = parseCsvHeader(line);
      return;
    }
    const cells = line.split(',');
    const exe = (cells[this.cols.application] ?? '').trim().toLowerCase();
    if (!exe || this.denylist.has(exe)) return;
    const ms = csvNumberAt(cells, this.cols.msBetweenPresents);
    if (ms === null) return;
    let tracker = this.trackers.get(exe);
    if (!tracker) {
      tracker = new FpsTracker();
      this.trackers.set(exe, tracker);
    }
    tracker.push(ms, this.now());
  }

  /**
   * FPS a mostrar (enganchado al juego): si el proceso enganchado sigue presentando, sus FPS; si no,
   * se re-engancha al de mayor tasa. Poda de paso los procesos que dejaron de presentar hace rato.
   */
  fps(): number | null {
    const now = this.now();
    // Poda.
    for (const [exe, tracker] of this.trackers) {
      if (now - tracker.lastAt() > PRUNE_MS) this.trackers.delete(exe);
    }

    // El enganchado sigue vivo → se mantiene aunque otro tenga más tasa.
    if (this.locked) {
      const fps = this.trackers.get(this.locked)?.fps(now) ?? null;
      if (fps !== null) return fps;
      this.locked = null;
    }

    // Re-enganche: el de mayor FPS entre los que presentan ahora.
    let mejorExe: string | null = null;
    let mejorFps = 0;
    for (const [exe, tracker] of this.trackers) {
      const fps = tracker.fps(now);
      if (fps !== null && fps > mejorFps) {
        mejorFps = fps;
        mejorExe = exe;
      }
    }
    if (mejorExe) {
      this.locked = mejorExe;
      return mejorFps;
    }
    return null;
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
