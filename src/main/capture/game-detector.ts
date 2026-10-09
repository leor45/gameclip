import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  GAME_POLL_INTERVAL_MS,
  KNOWN_GAME_PROCESSES,
  UNKNOWN_EXE_REFRESH_COOLDOWN_MS,
  exeKey,
  findRunningGamesMatch,
} from '@shared/games';
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
  /** Tope de frecuencia del re-índice por novedad; inyectable para tests. */
  unknownRefreshCooldownMs?: number;
}

/**
 * Sondea los procesos en ejecución y detecta TODOS los juegos que corren a la vez: los del índice
 * de launchers, los de la lista curada y los manuales. Emite 'games-changed' con la lista completa
 * cuando el CONJUNTO cambia (por nombres) o cuando un juego cambia de ejecutable (su lanzador deja
 * paso al exe real; el ejecutable confirmado es pegajoso mientras siga vivo). Un solo juego que
 * desaparece un sondeo mientras otros siguen actualiza la lista de inmediato; solo el vaciado total
 * espera `missesBeforeStop` sondeos seguidos sin ver ninguno (anti-parpadeo).
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

  // Re-índice por novedad: la primera pasada solo fija la línea base; después, un ejecutable nuevo que
  // la app no reconoce pide reconstruir el índice ('unknown-executable'), con throttle.
  private readonly unknownCooldownMs: number;
  private baselineTaken = false;
  private readonly seenProcesses = new Set<string>();
  private lastUnknownEmit = Number.NEGATIVE_INFINITY;
  private pendingUnknown = false;

  constructor(options: GameDetectorOptions = {}) {
    super();
    this.list = options.listProcessNames ?? listProcessNamesWindows;
    this.intervalMs = options.intervalMs ?? GAME_POLL_INTERVAL_MS;
    this.missesBeforeStop = options.missesBeforeStop ?? 2;
    this.customGames = options.customGames ?? [];
    this.index = options.index ?? {};
    this.unknownCooldownMs = options.unknownRefreshCooldownMs ?? UNKNOWN_EXE_REFRESH_COOLDOWN_MS;
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
      const names = await this.list();
      this.checkNovelty(names);
      const matches = this.keepExecutables(
        findRunningGamesMatch(names, { customGames: this.customGames, index: this.index }),
        names,
      );
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

  /**
   * ¿La lista difiere de la última confirmada? Por nombre y, en cada juego, por ejecutable: el mismo
   * juego que pasa de su lanzador al exe real (D4-BUG-1) tiene que llegar al manager para que la
   * captura le siga. Los ejecutables vienen normalizados de `findRunningGamesMatch` (`<clave>.exe`).
   */
  private setChanged(next: RunningGameMatch[]): boolean {
    if (next.length !== this.running.length) return true;
    const prev = new Map(this.running.map((g) => [g.name, g.executable]));
    return next.some((g) => prev.get(g.name) !== g.executable);
  }

  /**
   * Ejecutable pegajoso por juego. `findRunningGamesMatch` se queda con el PRIMER proceso de cada
   * juego en el orden de tasklist; con el lanzador y el exe real del mismo juego vivos a la vez, el
   * elegido podría saltar de uno a otro entre sondeos y re-apuntar la captura en cada salto. Si el
   * ejecutable confirmado de un juego sigue en marcha —y sigue resolviéndose como ESE juego—, se
   * conserva; si no, vale el del matching. Así el relevo ocurre una vez: cuando el viejo se cierra.
   */
  private keepExecutables(matches: RunningGameMatch[], processNames: string[]): RunningGameMatch[] {
    if (this.running.length === 0) return matches;
    const vivos = new Set(processNames.map(exeKey));
    const ctx = { customGames: this.customGames, index: this.index };
    return matches.map((match) => {
      const previo = this.running.find((g) => g.name === match.name);
      if (!previo || previo.executable === match.executable) return match;
      if (!vivos.has(exeKey(previo.executable))) return match;
      // Mismo criterio que el matching: un re-índice o un manual editado pueden haberlo hecho otro
      // juego (o ninguno), y entonces no puede seguir representando a este.
      const sigueSiendo = findRunningGamesMatch([previo.executable], ctx)[0]?.name === match.name;
      return sigueSiendo ? { ...match, executable: previo.executable } : match;
    });
  }

  /**
   * Novedad para el re-índice. La primera pasada solo fija la línea base: los procesos ya en marcha al
   * arrancar los cubre el `refreshGameIndex()` de arranque, así que aquí solo interesa lo que aparece
   * DESPUÉS —"lancé un juego con la app abierta"—. Un ejecutable nuevo que la app no reconoce (ni en el
   * índice de launchers, ni en la lista curada, ni en los manuales) se trata como posible juego recién
   * instalado y pide un re-índice con `'unknown-executable'`.
   *
   * Barato y acotado: cada ejecutable dispara como mucho una vez (set de vistos), y no se emite más de
   * una vez por `unknownCooldownMs`. Un candidato que cae dentro del cooldown queda pendiente y dispara
   * en cuanto expira, para no perderse un juego lanzado justo tras otro re-índice.
   */
  private checkNovelty(processNames: string[]): void {
    const keys = processNames.map(exeKey).filter(Boolean);
    if (!this.baselineTaken) {
      for (const key of keys) this.seenProcesses.add(key);
      this.baselineTaken = true;
      return;
    }

    let candidato = this.pendingUnknown;
    for (const key of keys) {
      if (this.seenProcesses.has(key)) continue;
      this.seenProcesses.add(key);
      if (!this.esReconocido(key)) candidato = true;
    }
    if (!candidato) return;

    const ahora = Date.now();
    if (ahora - this.lastUnknownEmit < this.unknownCooldownMs) {
      this.pendingUnknown = true; // sale al expirar el cooldown
      return;
    }
    this.lastUnknownEmit = ahora;
    this.pendingUnknown = false;
    this.emit('unknown-executable');
  }

  /** ¿La app ya sabe que esta clave es un juego? Mismo criterio que `findRunningGamesMatch`. */
  private esReconocido(key: string): boolean {
    return (
      key in this.index ||
      key in KNOWN_GAME_PROCESSES ||
      this.customGames.some((g) => exeKey(g.executable) === key)
    );
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
