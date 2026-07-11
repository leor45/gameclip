import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { GAME_POLL_INTERVAL_MS, findRunningGame } from '@shared/games';

export interface GameDetectorOptions {
  /** Listador de nombres de proceso; inyectable para tests. */
  listProcessNames?: () => Promise<string[]>;
  intervalMs?: number;
  /** Sondeos consecutivos sin ver el juego antes de darlo por cerrado (anti-parpadeo). */
  missesBeforeStop?: number;
}

/**
 * Sondea los procesos en ejecución y detecta juegos de la lista curada.
 * Emite 'game-started' (nombre) y 'game-stopped'; `currentGame` refleja el último estado.
 */
export class GameDetector extends EventEmitter {
  private readonly list: () => Promise<string[]>;
  private readonly intervalMs: number;
  private readonly missesBeforeStop: number;
  private timer: NodeJS.Timeout | null = null;
  private misses = 0;
  private polling = false;
  currentGame: string | null = null;

  constructor(options: GameDetectorOptions = {}) {
    super();
    this.list = options.listProcessNames ?? listProcessNamesWindows;
    this.intervalMs = options.intervalMs ?? GAME_POLL_INTERVAL_MS;
    this.missesBeforeStop = options.missesBeforeStop ?? 2;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), this.intervalMs);
    void this.poll();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async poll(): Promise<void> {
    if (this.polling) return; // un sondeo lento no debe apilarse con el siguiente
    this.polling = true;
    try {
      const game = findRunningGame(await this.list());
      if (game) {
        this.misses = 0;
        if (game !== this.currentGame) {
          this.currentGame = game;
          this.emit('game-started', game);
        }
      } else if (this.currentGame && ++this.misses >= this.missesBeforeStop) {
        this.currentGame = null;
        this.misses = 0;
        this.emit('game-stopped');
      }
    } catch {
      // sondeo best-effort: un fallo puntual de tasklist no cambia el estado
    } finally {
      this.polling = false;
    }
  }
}

/** Nombres de proceso vía tasklist (más liviano que arrancar PowerShell cada sondeo). */
function listProcessNamesWindows(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    execFile(
      'tasklist',
      ['/fo', 'csv', '/nh'],
      { windowsHide: true, timeout: 10000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(err);
        // Cada línea: "nombre.exe","pid",... — solo interesa la primera columna.
        const names = stdout
          .split(/\r?\n/)
          .map((line) => /^"([^"]+)"/.exec(line)?.[1] ?? '')
          .filter(Boolean);
        resolve(names);
      },
    );
  });
}
