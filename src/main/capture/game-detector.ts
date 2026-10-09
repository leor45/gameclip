import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  GAME_POLL_INTERVAL_MS,
  KNOWN_GAME_PROCESSES,
  UNKNOWN_EXE_REFRESH_COOLDOWN_MS,
  exeKey,
  findCustomGame,
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

  // Re-índice por novedad: la primera pasada solo fija la línea base; después, un ejecutable nuevo que
  // la app no reconoce pide reconstruir el índice ('unknown-executable'), con throttle.
  private readonly unknownCooldownMs: number;
  private baselineTaken = false;
  private readonly seenProcesses = new Set<string>();
  private lastUnknownEmit = Number.NEGATIVE_INFINITY;
  private pendingUnknown = false;

  constructor(options: GameDetectorOptions = {}) {
    super();
    this.list = options.listProcessNames ?? createTasklistLister();
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
      const matches = findRunningGamesMatch(names, {
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
      findCustomGame(this.customGames, key) !== undefined
    );
  }
}

/**
 * Ejecutable y argumentos del sondeo de procesos (puros, para testearlos). `tasklist` escribe en la
 * codepage OEM de la consola (850 en español): en `pingñé.exe` la ñ y la é llegaban como U+FFFD y
 * `ゲーム.exe` como `???.exe`, así que esos juegos nunca se detectaban. Se corre dentro de un `cmd`
 * que antes pasa su consola (propia y oculta, no la de la app) a UTF-8 con `chcp 65001`:
 *  - `/d`: sin AutoRun del registro, que podría ensuciar stdout.
 *  - `>nul`: el «Página de códigos activa» de chcp no llega a stdout.
 *  - `&` (no `&&`): si chcp fallara, tasklist corre igual con la codepage de antes (acentos rotos,
 *    pero la lista completa), nunca una lista vacía que el detector leería como «se cerraron todos».
 *    El exit code es el de tasklist, así que un fallo suyo sigue siendo un error del sondeo.
 */
export function tasklistCommand(): { file: string; args: string[] } {
  return { file: 'cmd.exe', args: ['/d', '/s', '/c', 'chcp 65001>nul & tasklist /fo csv /nh'] };
}

/** Nombres de proceso de la salida CSV de tasklist (`"nombre.exe","pid",...`): la primera columna. */
export function parseTasklistCsv(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => /^"([^"]+)"/.exec(line)?.[1] ?? '')
    .filter(Boolean);
}

/** Lo que la válvula necesita del proceso lanzado: su pid y si ya terminó (un `ChildProcess` vale). */
export interface ProcesoLanzado {
  readonly pid?: number;
  readonly exitCode: number | null;
  readonly signalCode: NodeJS.Signals | null;
}

/** Corre un comando, entrega su stdout y devuelve el proceso lanzado; inyectable para tests. */
export type RunCommand = (
  file: string,
  args: string[],
  done: (err: Error | null, stdout: string) => void,
) => ProcesoLanzado;

/** Mata el árbol de procesos de `pid`; inyectable para tests. */
export type KillTree = (pid: number, done: (err: Error | null) => void) => void;

const execFileUtf8: RunCommand = (file, args, done) =>
  execFile(
    file,
    args,
    { windowsHide: true, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' },
    (err, stdout) => done(err, stdout),
  );

/**
 * `taskkill /F /T` sobre el `cmd`: se lleva también al tasklist (su hijo) y a su conhost. taskkill es
 * hijo directo, así que su propio timeout sí lo mata a él si también se cuelga (usa WMI).
 */
const taskkillTree: KillTree = (pid, done) => {
  execFile(
    'taskkill',
    ['/F', '/T', '/PID', String(pid)],
    { windowsHide: true, timeout: 10000 },
    (err) => done(err),
  );
};

export interface TasklistListerOptions {
  run?: RunCommand;
  killTree?: KillTree;
  /** El sondeo falla pasado este tiempo sin respuesta (el detector conserva su estado). */
  timeoutMs?: number;
  /** Válvula: con el sondeo vivo tanto tiempo, se mata el árbol del `cmd` (y se reintenta). */
  valveMs?: number;
}

/**
 * Listador de nombres de proceso vía tasklist (más liviano que arrancar PowerShell cada sondeo).
 *
 * A los `timeoutMs` el sondeo falla, como siempre, pero el `cmd` NO se mata: tasklist es su hijo (nieto
 * de la app) y matar el `cmd` lo dejaría huérfano y vivo (medido). tasklist consulta WMI; si WMI se
 * cuelga, cada sondeo dejaría un tasklist más. En su lugar, mientras el anterior siga vivo los sondeos
 * fallan sin lanzar otro (nunca hay más de uno a la vez) y el detector conserva su estado, igual que
 * ante un timeout.
 *
 * Válvula: si el sondeo sigue vivo a los `valveMs`, se mata el árbol del `cmd` (`taskkill /F /T`), y
 * el sondeo sigue «en curso» hasta que el `cmd` vuelve de verdad. Si taskkill falla o se cuelga (WMI
 * colgado del todo), se reintenta `valveMs` después de que responda. Sin ella, un tasklist que no
 * volviera nunca congelaba la detección hasta reiniciar (con un juego en marcha, la grabación de
 * sesión no paraba).
 */
export function createTasklistLister(options: TasklistListerOptions = {}): () => Promise<string[]> {
  const run = options.run ?? execFileUtf8;
  const killTree = options.killTree ?? taskkillTree;
  const timeoutMs = options.timeoutMs ?? 10000;
  const valveMs = options.valveMs ?? 60000;
  let enCurso = false;
  return () => {
    if (enCurso) return Promise.reject(new Error('tasklist: el sondeo anterior sigue en curso'));
    const { file, args } = tasklistCommand();
    return new Promise<string[]>((resolve, reject) => {
      enCurso = true;
      const inicio = Date.now();
      // Estado de ESTE sondeo: un callback tardío de uno ya liberado no puede liberar al siguiente.
      let terminado = false;
      let valvula: ReturnType<typeof setTimeout> | undefined;
      const timer = setTimeout(
        () => reject(new Error(`tasklist: sin respuesta en ${timeoutMs} ms`)),
        timeoutMs,
      );
      const terminar = (err: Error | null, stdout: string): void => {
        if (terminado) return;
        terminado = true;
        clearTimeout(timer);
        clearTimeout(valvula);
        enCurso = false;
        if (err) reject(err);
        else resolve(parseTasklistCsv(stdout));
      };

      const armarValvula = (proceso: ProcesoLanzado, intento: number, previo: string): void => {
        valvula = setTimeout(() => {
          if (terminado) return;
          const segundos = Math.round((Date.now() - inicio) / 1000);
          const pid = proceso.pid;
          if (pid === undefined || proceso.exitCode !== null || proceso.signalCode !== null) {
            // El cmd ya salió (su pid podría ser ya de otro proceso): no hay árbol que matar. Algo
            // ajeno retiene su salida; se libera el sondeo para que la detección no quede congelada.
            console.warn(
              `[games] tasklist lleva ${segundos} s sin cerrar y su cmd ya salió: se libera`,
            );
            terminar(new Error('tasklist: el cmd salió sin cerrar su salida'), '');
            return;
          }
          console.warn(
            `[games] tasklist lleva ${segundos} s sin responder: se mata el árbol del cmd ` +
              `(pid ${pid}, intento ${intento}${previo ? `; el anterior falló: ${previo}` : ''})`,
          );
          killTree(pid, (err) => {
            // Si el cmd sigue sin volver, otro intento `valveMs` después de que responda ESTE
            // taskkill: nunca dos a la vez y nada se acumula.
            if (!terminado)
              armarValvula(proceso, intento + 1, err ? err.message.split(/\r?\n/)[0] : '');
          });
        }, valveMs);
      };

      try {
        const proceso = run(file, args, terminar);
        if (!terminado) armarValvula(proceso, 1, '');
      } catch (err) {
        // execFile puede lanzar en síncrono (fallo de spawn no recuperable): sin esto quedaría
        // «en curso» para siempre y la detección no volvería a sondear.
        terminar(err instanceof Error ? err : new Error(String(err)), '');
      }
    });
  };
}
