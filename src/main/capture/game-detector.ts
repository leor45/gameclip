import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { GAME_POLL_INTERVAL_MS, findRunningGamesMatch } from '@shared/games';
import type { CustomGame, GameIndex, RunningGameMatch } from '@shared/games';

export interface GameDetectorOptions {
  /** Listador de nombres de proceso; inyectable para tests. */
  listProcessNames?: () => Promise<string[]>;
  intervalMs?: number;
  /** Sondeos consecutivos sin ver NINGÚN juego antes de dar la lista por vacía (anti-parpadeo). */
  missesBeforeStop?: number;
  /** Juegos añadidos a mano (tratados como juegos conocidos). */
  customGames?: CustomGame[];
  /** Juegos instalados que encontró la app en los launchers (`pioneergame` → `ARC Raiders`). */
  index?: GameIndex;
}

/**
 * Sondea los procesos en ejecución y detecta TODOS los juegos que corren a la vez: los del índice
 * de launchers, los de la lista curada y los manuales. Emite 'games-changed' con la lista completa
 * cuando el CONJUNTO cambia (comparado por nombres). Un solo juego que desaparece un sondeo
 * mientras otros siguen actualiza la lista de inmediato; solo el vaciado total espera
 * `missesBeforeStop` sondeos seguidos sin ver ninguno (anti-parpadeo).
 *
 * El sondeo es deliberadamente barato —`tasklist` y una consulta al índice en memoria—: construir
 * el índice cuesta, pero eso pasa fuera de aquí, al arrancar.
 */
export class GameDetector extends EventEmitter {
  private readonly list: () => Promise<string[]>;
  private readonly intervalMs: number;
  private readonly missesBeforeStop: number;
  private timer: NodeJS.Timeout | null = null;
  private misses = 0;
  private polling = false;
  private customGames: CustomGame[];
  private index: GameIndex;
  /** Juegos vistos en el último estado confirmado (el que se emitió). */
  running: RunningGameMatch[] = [];

  constructor(options: GameDetectorOptions = {}) {
    super();
    this.list = options.listProcessNames ?? listProcessNamesWindows;
    this.intervalMs = options.intervalMs ?? GAME_POLL_INTERVAL_MS;
    this.missesBeforeStop = options.missesBeforeStop ?? 2;
    this.customGames = options.customGames ?? [];
    this.index = options.index ?? {};
  }

  /** Actualiza los juegos manuales (los ajustes cambiaron); se aplican en el próximo sondeo. */
  setCustomGames(games: CustomGame[]): void {
    this.customGames = games;
  }

  /** Actualiza el índice de juegos instalados (terminó de construirse, o el owner re-escaneó). */
  setIndex(index: GameIndex): void {
    this.index = index;
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
      const matches = findRunningGamesMatch(await this.list(), {
        customGames: this.customGames,
        index: this.index,
      });
      if (matches.length > 0) {
        // Con al menos un juego, la lista es de fiar: se aplica de inmediato (aunque alguno
        // haya desaparecido respecto al sondeo anterior).
        this.misses = 0;
        if (this.setChanged(matches)) {
          this.running = matches;
          this.emit('games-changed', this.running);
        }
      } else if (this.running.length > 0 && ++this.misses >= this.missesBeforeStop) {
        // Solo el vaciado total espera varios sondeos: evita el parpadeo de tasklist.
        this.running = [];
        this.misses = 0;
        this.emit('games-changed', this.running);
      }
    } catch {
      // sondeo best-effort: un fallo puntual de tasklist no cambia el estado
    } finally {
      this.polling = false;
    }
  }

  /** ¿El conjunto de juegos (por nombre) difiere del último confirmado? */
  private setChanged(next: RunningGameMatch[]): boolean {
    if (next.length !== this.running.length) return true;
    const prev = new Set(this.running.map((g) => g.name));
    return next.some((g) => !prev.has(g.name));
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
