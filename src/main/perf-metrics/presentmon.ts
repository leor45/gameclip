import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline';
import type { LineProcess } from './sensors';

// Wrapper de PresentMon 2.x (Intel, MIT): mide los FPS leyendo por ETW los eventos de presentación.
// Captura TODOS los procesos y mantiene un contador por proceso; el overlay muestra los FPS del
// proceso "enganchado" (el juego) mientras siga presentando, y si deja de hacerlo salta al de mayor
// tasa. Así los FPS no dependen de la detección de juegos ni se pierden al pasar la app a segundo
// plano (mientras siga presentando).
//
// Por qué la 2.x y no la 1.x: la 1.10 NO contabiliza los frames que generan los multiplicadores
// (DLSS Frame Generation y equivalentes). Medido en RE Requiem con DLSS FG activo contra el overlay
// de Steam (que mostraba «DLSS 128 | FPS 64»): la 1.10 daba ~19-61 fps y la 2.5.1 daba 133, que es
// el total con frames generados. Las columnas que leemos (`Application`, `MsBetweenPresents`) están
// en ambas, así que el parseo no cambió al migrar.
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
/**
 * PresentMon vivo pero sin entregar UNA sola línea en este tiempo = su sesión ETW no está
 * recibiendo eventos. Pasa de verdad: si quedan sesiones huérfanas (de un cierre sucio propio o de
 * otros capturadores como el overlay de Steam o la NVIDIA App), Windows agota los cupos del
 * proveedor y PresentMon arranca «bien» pero mudo, sin error ni salida. Sin este watchdog los FPS
 * se quedaban en «—» para siempre y en silencio.
 */
const NO_DATA_MS = 12_000;
/** Reintentos rápidos antes de pasar a la cadencia lenta. */
const MAX_REINTENTOS = 3;
/**
 * Cadencia tras agotar los reintentos rápidos. No se abandona del todo: la causa habitual (cupos
 * ETW ocupados por sesiones huérfanas o por otro capturador) se resuelve sola al cerrarse el otro
 * programa, y sin reintento lento los FPS quedarían muertos hasta reiniciar GameClip.
 */
const REINTENTO_LENTO_MS = 60_000;
/**
 * Espera antes de los primeros reintentos cuando el proceso **muere** (distinto de quedarse mudo:
 * ahí hay que darle `NO_DATA_MS` para ver si arranca a entregar datos; aquí ya no hay nada que
 * esperar, solo evitar encadenar arranques en caliente).
 */
const REINTENTO_MUERTE_MS = 5_000;
/**
 * Cuánto tiene que superar un proceso al enganchado para robarle la lectura. El enganche evita que
 * el contador salte entre apps, pero NO puede ser permanente: apps de escritorio (Discord, editores,
 * navegadores) presentan sin parar, y si el overlay arranca antes que el juego se quedaba pegado a
 * ellas para siempre —medido: el overlay marcaba 52 fps, que era Discord, con el juego a 129—. Con
 * este margen el juego (mucho más rápido) recupera el enganche y el ruido normal no lo mueve.
 */
const MARGEN_CAMBIO = 1.25;

/**
 * Un proceso solo entra al enganche si presenta por la ruta directa a hardware. Se compara por
 * PREFIJO y no por subcadena a propósito: `Hardware Composed: Independent Flip` contiene la palabra
 * «Composed» y aun así es un modo de hardware (ventana sin bordes con MPO), así que buscar
 * «Composed» dentro de la cadena lo descartaría por error.
 *
 * Califican: `Hardware: Legacy Flip`, `Hardware: Legacy Copy to front buffer`,
 * `Hardware: Independent Flip` y `Hardware Composed: Independent Flip` — pantalla completa y ventana
 * sin bordes. No califican `Composed: Flip`, `Composed: Copy with …` ni `Unknown`, que es por donde
 * presentan Discord, los navegadores y los editores.
 */
const PREFIJO_HARDWARE = 'hardware';

// Procesos que nunca son "el juego": el compositor de Windows y (se añade en runtime) la propia
// GameClip. El overlay y la ventana de la app presentan frames pero no son lo que el usuario mide.
const DENYLIST_BASE = ['dwm.exe'];

/**
 * Argumentos de PresentMon 2.x (flags con doble guion). Sin `--process_name` captura TODOS los
 * procesos, que es lo que queremos: los FPS no dependen de la detección de juegos. `--exclude` quita
 * el compositor y GameClip; `--no_console_stats` evita que la vista de swap chains salga por la
 * misma salida y ensucie el CSV; `--stop_existing_session` recupera una sesión ETW huérfana de un
 * cierre sucio anterior.
 *
 * Sin elevación PresentMon no puede abrir la sesión ETW y muere: GameClip degrada los FPS a «—».
 */
export function presentMonArgs(excludeExe: string[]): string[] {
  const args = [
    '--output_stdout',
    '--no_console_stats',
    '--stop_existing_session',
    '--session_name', 'GameClipPerf',
  ];
  for (const exe of excludeExe) args.push('--exclude', exe);
  return args;
}

/** Índice de columnas de la cabecera CSV que nos interesan; null si falta alguna imprescindible. */
export interface CsvColumns {
  application: number;
  msBetweenPresents: number;
  /**
   * Columna del modo de presentación, o null si la cabecera no la trae. Es **opcional** a
   * propósito: si una versión futura de PresentMon la renombrara, exigirla invalidaría la cabecera
   * entera y los FPS morirían del todo. Sin ella se degrada a «todo califica», que es el
   * comportamiento previo a esta feature — peor, pero no roto.
   */
  presentMode: number | null;
}

export function parseCsvHeader(headerLine: string): CsvColumns | null {
  const cols = headerLine.split(',').map((c) => c.trim().toLowerCase());
  const application = cols.indexOf('application');
  const msBetweenPresents = cols.indexOf('msbetweenpresents');
  if (application < 0 || msBetweenPresents < 0) return null;
  const presentMode = cols.indexOf('presentmode');
  return { application, msBetweenPresents, presentMode: presentMode < 0 ? null : presentMode };
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
  /** Última lectura válida, para sostenerla mientras la ventana esté vacía por una ráfaga. */
  private ultimoFps: number | null = null;
  private ultimoFpsAt = Number.NEGATIVE_INFINITY;
  /** Ver `calificar()`: solo se enciende, nunca se apaga mientras el tracker viva. */
  private calificado = false;

  /**
   * Marca el proceso como candidato al enganche. La calificación es una **puerta de entrada**, no
   * un filtro por lectura: una vez dentro, el proceso conserva el contador aunque deje de presentar
   * en modo hardware (DWM lo degrada al abrir un menú o al superponer un overlay de terceros) o
   * pase a segundo plano. Filtrar lectura a lectura haría parpadear el contador.
   */
  calificar(): void {
    this.calificado = true;
  }

  estaCalificado(): boolean {
    return this.calificado;
  }

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

  /**
   * FPS de la ventana, o null si no hay presents frescos.
   *
   * Si la ventana queda vacía NO se cae a null de inmediato: se sostiene la última lectura durante
   * `STALE_MS`. Las muestras se fechan al *llegar* por la tubería, y PresentMon escribe por bloques
   * cuando su salida no es una consola, así que llegan a ráfagas; con la ventana (1 s) igual al
   * periodo de muestreo del overlay (1 s) no hay holgura ninguna y una ráfaga que tarde un pelo de
   * más vaciaba la ventana. Se veía como un parpadeo a «—» con los FPS volviendo acto seguido. Cubre
   * también el bache de cuando el frame generation engancha o suelta y recrea la swapchain.
   */
  fps(now: number): number | null {
    const vivos = this.samples.filter((s) => s.at >= now - FPS_WINDOW_MS);
    if (vivos.length) {
      const media = vivos.reduce((acc, s) => acc + s.ms, 0) / vivos.length;
      if (media > 0) {
        this.ultimoFps = 1000 / media;
        this.ultimoFpsAt = now;
        return this.ultimoFps;
      }
    }
    return now - this.ultimoFpsAt > STALE_MS ? null : this.ultimoFps;
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
 * mientras la métrica FPS esté activa: `start()` lo lanza, `stop()` lo mata.
 *
 * Si el proceso muere por su cuenta **se relanza solo**, con la misma espera escalonada que el
 * watchdog usa para «vivo pero mudo» — antes se marcaba como fallido para siempre y los FPS quedaban
 * en «—» el resto de la sesión, en silencio. El único fallo permanente que queda es que falte el
 * binario: eso no se arregla esperando.
 */
export class PresentMonReader {
  private child: LineProcess | null = null;
  private cols: CsvColumns | null = null;
  /** Fallo del que no se vuelve: hoy, solo «no está el .exe». */
  private failed = false;
  /** Cuándo murió por su cuenta, o null si está vivo (o parado a propósito). */
  private muertoEn: number | null = null;
  /** exe (lowercase) → tracker de FPS. */
  private trackers = new Map<string, FpsTracker>();
  private denylist: Set<string>;
  /** Proceso cuyos FPS se muestran; se mantiene mientras presente. */
  private locked: string | null = null;
  /** Juego detectado por la app (lowercase): segunda vía de calificación. Ver `setDetectedGame`. */
  private juegoDetectado: string | null = null;
  private readonly now: () => number;
  /** Líneas recibidas del proceso vivo; 0 tras `NO_DATA_MS` dispara el watchdog. */
  private lineas = 0;
  private arrancadoEn = 0;
  private reintentos = 0;
  /** Reinicio propio en curso: su `exit` no debe marcar el reader como fallido. */
  private reiniciando = false;

  constructor(private readonly deps: PresentMonDeps) {
    this.now = deps.now ?? (() => Date.now());
    const self = (deps.selfExe ?? (() => basename(process.execPath)))().toLowerCase();
    this.denylist = new Set([...DENYLIST_BASE, self]);
  }

  start(): void {
    // Si murió y espera su reintento espaciado, no se adelanta aquí: `reintentarSiMurio` lo hará.
    if (this.child || this.failed || this.muertoEn !== null) return;
    this.reintentos = 0;
    this.spawnChild();
  }

  private spawnChild(): void {
    const exePath = this.deps.helperPath();
    if (!exePath) {
      this.failed = true;
      return;
    }
    const child = this.deps.spawn(exePath, presentMonArgs([...this.denylist]));
    this.cols = null;
    this.lineas = 0;
    this.arrancadoEn = this.now();
    child.onLine((line) => {
      this.lineas++;
      this.onLine(line);
    });
    child.onExit(() => {
      if (this.child !== child) return;
      this.child = null;
      this.trackers.clear();
      this.locked = null;
      // Una muerte por su cuenta (típicamente: sin permisos para la sesión ETW) se anota con la
      // hora, no se marca como fallo terminal: `reintentarSiMurio` la recupera espaciada. Un
      // reinicio nuestro no cuenta como muerte — lo relanza el propio watchdog.
      if (!this.reiniciando) this.muertoEn = this.now();
    });
    this.child = child;
  }

  /**
   * PresentMon vivo pero sin entregar una sola línea: su sesión no recibe eventos (cupos del
   * proveedor agotados por sesiones huérfanas, propias o de otros capturadores). Se reinicia el
   * proceso —`-stop_existing_session` recupera de paso nuestra propia sesión huérfana— con un tope
   * de reintentos.
   */
  private watchdog(now: number): void {
    if (!this.child || this.lineas > 0) return;
    // Tras los primeros intentos se espacia el reintento, para no estar matando y relanzando un
    // proceso cada 12 s en una máquina que sencillamente no puede capturar ahora mismo.
    const lento = this.reintentos >= MAX_REINTENTOS;
    if (now - this.arrancadoEn < (lento ? REINTENTO_LENTO_MS : NO_DATA_MS)) return;
    this.reintentos++;
    if (!lento) {
      console.warn(
        `[perf] PresentMon no entregó datos en ${NO_DATA_MS / 1000}s; reintento ${this.reintentos}/${MAX_REINTENTOS}`,
      );
    } else if (this.reintentos === MAX_REINTENTOS + 1) {
      // Solo se avisa al entrar en cadencia lenta: repetirlo cada minuto sería ruido en el log.
      console.warn(
        `[perf] PresentMon sigue sin datos; se reintentará cada ${REINTENTO_LENTO_MS / 1000}s. ` +
          'Causa habitual: sesiones ETW ocupadas por otro capturador (overlay de Steam, NVIDIA App) ' +
          'o falta de permisos de administrador.',
      );
    }
    this.reiniciando = true;
    this.child.kill();
    this.child = null;
    this.reiniciando = false;
    this.spawnChild();
  }

  /**
   * Relanza PresentMon si murió y ya toca. Camino aparte del watchdog: aquel cubre «vivo pero mudo»
   * y este «se fue». Comparten reloj, contador y cadencia, así que un proceso que alterna entre
   * caerse y quedarse mudo escala igual hacia la cadencia lenta en vez de reintentar sin freno.
   */
  private reintentarSiMurio(now: number): void {
    if (this.child || this.muertoEn === null || this.failed) return;
    const lento = this.reintentos >= MAX_REINTENTOS;
    if (now - this.muertoEn < (lento ? REINTENTO_LENTO_MS : REINTENTO_MUERTE_MS)) return;
    this.reintentos++;
    if (!lento) {
      console.warn(`[perf] PresentMon murió; reintento ${this.reintentos}/${MAX_REINTENTOS}`);
    } else if (this.reintentos === MAX_REINTENTOS + 1) {
      console.warn(
        `[perf] PresentMon sigue cayéndose; se reintentará cada ${REINTENTO_LENTO_MS / 1000}s.`,
      );
    }
    this.muertoEn = null;
    this.spawnChild();
  }

  stop(): void {
    // El kill dispara `exit`; sin esta marca se interpretaría como muerte por su cuenta.
    this.reiniciando = true;
    this.child?.kill();
    this.reiniciando = false;
    this.child = null;
    this.failed = false;
    this.muertoEn = null;
    this.cols = null;
    this.lineas = 0;
    this.reintentos = 0;
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
    if (!tracker.estaCalificado() && this.califica(cells, exe)) tracker.calificar();
    tracker.push(ms, this.now());
  }

  /**
   * ¿Este present hace que el proceso entre al enganche? Dos vías, y basta una:
   * presentar por hardware (pantalla completa o sin bordes), o ser el juego que la app ya tiene
   * detectado —que cubre el emulador en ventana normal—. Sin columna de modo no se puede juzgar,
   * así que se cae al comportamiento previo: todo califica.
   */
  private califica(cells: string[], exe: string): boolean {
    if (exe === this.juegoDetectado) return true;
    const modeCol = this.cols?.presentMode ?? null;
    if (modeCol === null) return true;
    return (cells[modeCol] ?? '').trim().toLowerCase().startsWith(PREFIJO_HARDWARE);
  }

  /**
   * Juego detectado por la app (automático o manual), o null. Es una vía que **solo puede
   * encender**: nunca descalifica a nadie, así que ningún proceso que hoy muestre FPS deja de
   * hacerlo por esto. Pasar null no apaga el contador de un proceso ya calificado —la calificación
   * es pegajosa—, solo deja de calificar por esta vía a los que vengan después.
   */
  setDetectedGame(exe: string | null): void {
    this.juegoDetectado = exe ? exe.trim().toLowerCase() : null;
    // Califica ya al que tenga tracker vivo, sin esperar a su siguiente present.
    if (this.juegoDetectado) this.trackers.get(this.juegoDetectado)?.calificar();
  }

  /**
   * FPS a mostrar, enganchado al juego. El enganchado conserva la lectura mientras siga presentando
   * —aunque pase a segundo plano, y aunque otra app presente algo más rápido—, pero otro proceso se
   * la queda si lo supera por `MARGEN_CAMBIO`. Ese margen es lo que hace que el juego recupere el
   * contador si el overlay arrancó enganchado a una app de escritorio, sin que el contador ande
   * saltando por variaciones normales. Poda de paso lo que dejó de presentar.
   */
  fps(): number | null {
    const now = this.now();
    // Primero recuperar al muerto (si toca) y luego vigilar al vivo: así el watchdog no evalúa a un
    // proceso recién nacido, que aún no ha tenido tiempo de entregar nada.
    this.reintentarSiMurio(now);
    this.watchdog(now);
    for (const [exe, tracker] of this.trackers) {
      if (now - tracker.lastAt() > PRUNE_MS) this.trackers.delete(exe);
    }

    let mejorExe: string | null = null;
    let mejorFps = 0;
    for (const [exe, tracker] of this.trackers) {
      // Solo los calificados compiten por el enganche: una app de escritorio no entra ni aunque sea
      // la única presentando (entonces no hay FPS que mostrar y el overlay pinta «—»).
      if (!tracker.estaCalificado()) continue;
      const fps = tracker.fps(now);
      if (fps !== null && fps > mejorFps) {
        mejorFps = fps;
        mejorExe = exe;
      }
    }

    const actual = this.locked ? (this.trackers.get(this.locked)?.fps(now) ?? null) : null;
    // El enganchado dejó de presentar: se lo queda el más rápido (si hay alguno).
    if (actual === null) {
      this.locked = mejorExe;
      return mejorExe ? mejorFps : null;
    }
    // Sigue vivo: solo lo pierde ante alguien claramente más rápido.
    if (mejorExe && mejorExe !== this.locked && mejorFps > actual * MARGEN_CAMBIO) {
      this.locked = mejorExe;
      return mejorFps;
    }
    return actual;
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
