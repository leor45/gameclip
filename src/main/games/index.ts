import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GameIndex } from '@shared/games';
import { SCAN_RULES_VERSION, executablesIn } from './scan';
import { epicSource } from './sources/epic';
import { gogSource } from './sources/gog';
import { riotSource } from './sources/riot';
import { steamSource } from './sources/steam';
import { uninstallRegistrySource } from './sources/uninstall-registry';
import { xboxSource } from './sources/xbox';
import type { GameSource, InstalledGame } from './types';

export type { GameSource, InstalledGame } from './types';

/**
 * Índice de juegos instalados: `ejecutable → nombre del juego`. Es lo que permite detectar un juego
 * que no está en la lista curada (`pioneergame` → `ARC Raiders`) sin que el owner lo dé de alta.
 *
 * Se construye leyendo los launchers y escaneando la carpeta de cada juego. Como eso cuesta, el
 * resultado se cachea: en el arranque siguiente el índice está disponible al instante, y solo se
 * vuelve a escanear si los launchers dicen que la lista de juegos cambió, si cambiaron las reglas de
 * escaneo (huella) o si el usuario pide «Volver a escanear» (forzado).
 *
 * **Nunca se toca en el sondeo de procesos**: ese sigue con `tasklist` y una consulta a este mapa.
 */

interface CacheEnDisco {
  huella: string;
  index: GameIndex;
}

/**
 * Lo que se compara para saber si hay que re-escanear: con qué reglas se indexó, qué juegos hay y
 * dónde. Barato de calcular. Sin la versión de las reglas, un arreglo del escaneo no llegaba a quien
 * ya tenía caché (seguía con los falsos positivos que el arreglo quitaba).
 */
export function huellaDe(juegos: InstalledGame[]): string {
  const juegosOrdenados = juegos
    .map((j) => `${j.name}\u0000${j.installDir}`)
    .sort()
    .join('\u0001');
  return `reglas:${SCAN_RULES_VERSION}\u0002${juegosOrdenados}`;
}

/**
 * Mapa `ejecutable → nombre` a partir de los juegos instalados.
 *
 * Un ejecutable que aparece en DOS juegos distintos (`launcher.exe`, `installermessage.exe`) es
 * ambiguo: no se puede saber a cuál pertenece, así que **se descarta**. Quedarse con el primero
 * sería peor que no tenerlo — bastaría con que ese proceso corriera para detectar el juego
 * equivocado. Es un filtro que se afina solo: el ruido genérico se cae sin mantener listas.
 */
export async function indexarEjecutables(
  juegos: InstalledGame[],
  onAmbiguo?: (exe: string, juegos: string[]) => void,
): Promise<GameIndex> {
  const candidatos = new Map<string, Set<string>>();
  for (const juego of juegos) {
    for (const exe of await executablesIn(juego.installDir)) {
      const nombres = candidatos.get(exe) ?? new Set<string>();
      nombres.add(juego.name);
      candidatos.set(exe, nombres);
    }
  }

  const index: GameIndex = {};
  for (const [exe, nombres] of candidatos) {
    if (nombres.size > 1) {
      onAmbiguo?.(exe, [...nombres]);
      continue;
    }
    index[exe] = [...nombres][0];
  }
  return index;
}

export const DEFAULT_SOURCES: GameSource[] = [
  steamSource,
  epicSource,
  xboxSource,
  gogSource,
  riotSource,
  uninstallRegistrySource,
];

export interface GameIndexServiceOptions {
  /** Fichero de caché (userData/games-index.json). */
  cachePath: string;
  sources?: GameSource[];
  log?: (msg: string) => void;
  /**
   * Nombres de catálogo que NO son juegos (lista «no son juegos» de Ajustes). Recibe los juegos que
   * devolvieron los launchers —así quien la provee puede sincronizar la lista curada en el momento— y
   * se aplica ANTES de indexar: un exe que comparten un juego y una app excluida no se vuelve ambiguo.
   */
  exclusions?: (juegos: InstalledGame[]) => string[];
}

/**
 * Mantiene el índice vivo: lo carga del caché al arrancar (instantáneo) y lo refresca en segundo
 * plano. Mientras el refresco no termina, el índice sigue siendo el del arranque anterior — nunca
 * se queda a cero.
 */
export class GameIndexService {
  private index: GameIndex = {};
  private readonly cachePath: string;
  private readonly sources: GameSource[];
  private readonly log: (msg: string) => void;
  /** El refresco que está corriendo ahora (uno a la vez). */
  private refreshing: Promise<GameIndex> | null = null;
  /** El refresco en cola detrás de `refreshing`: uno solo para todo lo pedido mientras corre. */
  private siguiente: { promesa: Promise<GameIndex>; force: boolean } | null = null;
  private readonly exclusions: (juegos: InstalledGame[]) => string[];
  /** Lo que devolvieron los launchers en la última lectura, excluidos incluidos (para la UI). */
  private instalados: InstalledGame[] = [];
  /** Se resuelve al terminar el primer refresco (bien o mal): desde ahí `installed()` es fiable. */
  private readonly primerRefresco: Promise<void>;
  private marcarListo: () => void = () => {};

  constructor(options: GameIndexServiceOptions) {
    this.cachePath = options.cachePath;
    this.sources = options.sources ?? DEFAULT_SOURCES;
    this.log = options.log ?? (() => {});
    this.exclusions = options.exclusions ?? (() => []);
    this.index = this.leerCache()?.index ?? {};
    this.primerRefresco = new Promise((resolve) => {
      this.marcarListo = resolve;
    });
  }

  /**
   * Se resuelve cuando termina el primer refresco (con éxito o no). Lo usa el servicio de iconos: hasta
   * entonces `installed()` está vacío y no sabría dónde está instalado cada juego.
   */
  ready(): Promise<void> {
    return this.primerRefresco;
  }

  /** El índice vigente. Siempre devuelve algo (vacío si es el primerísimo arranque). */
  current(): GameIndex {
    return this.index;
  }

  /** Juegos instalados según la última lectura de los launchers (incluidos los excluidos). */
  installed(): InstalledGame[] {
    return [...this.instalados];
  }

  /**
   * Relee los launchers y re-escanea si hace falta. Concurrente-segura: un refresco a la vez. Con
   * `force` (botón «Volver a escanear») se re-escanea aunque la huella coincida —el contenido de las
   * carpetas puede cambiar sin que cambie la lista de juegos—.
   *
   * Lo pedido mientras otro refresco corre NO se resuelve con ese: ya leyó los launchers y la lista
   * «no son juegos», así que una app recién excluida seguiría en el índice. Va a un refresco en cola
   * que arranca cuando el actual termina (bien o mal); todo lo que llegue antes comparte esa cola, que
   * queda forzada si alguno lo pidió forzado.
   */
  refresh(options: { force?: boolean } = {}): Promise<GameIndex> {
    const force = options.force ?? false;
    // Primero la cola: entre el fin del refresco en curso y el arranque de la cola `refreshing` ya es
    // null, y lanzar otro ahí haría correr dos a la vez.
    if (this.siguiente) {
      this.siguiente.force ||= force;
      return this.siguiente.promesa;
    }
    if (!this.refreshing) return this.lanzar(force);

    const enCola: { promesa: Promise<GameIndex>; force: boolean } = {
      force,
      // Un fallo del refresco en curso es de sus llamadores; la cola corre igual.
      promesa: this.refreshing
        .catch(() => undefined)
        .then(() => {
          if (this.siguiente === enCola) this.siguiente = null;
          return this.lanzar(enCola.force);
        }),
    };
    this.siguiente = enCola;
    return enCola.promesa;
  }

  private lanzar(force: boolean): Promise<GameIndex> {
    const actual: Promise<GameIndex> = this.doRefresh(force).finally(() => {
      if (this.refreshing === actual) this.refreshing = null;
      this.marcarListo();
    });
    this.refreshing = actual;
    return actual;
  }

  private async doRefresh(force: boolean): Promise<GameIndex> {
    const instalados = await this.listarJuegos();
    if (instalados.length === 0) {
      this.log('[games] ningún launcher devolvió juegos instalados');
      return this.index;
    }

    this.instalados = instalados;
    // Los excluidos salen antes de la huella: cambiar la lista cambia la huella y re-indexa.
    const excluidos = new Set(this.exclusions(instalados).map((n) => n.trim().toLowerCase()));
    const juegos = instalados.filter((j) => !excluidos.has(j.name.trim().toLowerCase()));

    // La huella evita el escaneo caro cuando no ha cambiado nada desde el arranque anterior.
    const huella = huellaDe(juegos);
    const cache = this.leerCache();
    if (!force && cache?.huella === huella) {
      this.index = cache.index;
      this.log(`[games] índice desde caché: ${juegos.length} juegos`);
      return this.index;
    }

    this.index = await indexarEjecutables(juegos, (exe, nombres) =>
      this.log(`[games] '${exe}.exe' es ambiguo (${nombres.join(' / ')}): se descarta`),
    );
    this.escribirCache({ huella, index: this.index });
    this.log(
      `[games] índice reconstruido: ${juegos.length} juegos, ${Object.keys(this.index).length} ejecutables`,
    );
    return this.index;
  }

  /** Las fuentes corren en paralelo y por separado: si una peta, las demás siguen. */
  private async listarJuegos(): Promise<InstalledGame[]> {
    const resultados = await Promise.all(
      this.sources.map(async (source) => {
        try {
          const juegos = await source.listInstalledGames();
          this.log(`[games] ${source.id}: ${juegos.length} juegos`);
          return juegos;
        } catch (err) {
          this.log(`[games] ${source.id} falló: ${err instanceof Error ? err.message : err}`);
          return [];
        }
      }),
    );

    // Un mismo juego puede salir por dos fuentes (un juego de Steam publicado por Ubisoft aparece
    // también en el registro de desinstalación): se queda la primera aparición.
    const out: InstalledGame[] = [];
    const vistos = new Set<string>();
    for (const juego of resultados.flat()) {
      // Ruta canónica: GOG da la carpeta sin barra final y el registro con ella. Comparadas en crudo
      // el juego contaba dos veces, y con nombres distintos sus exes se volvían ambiguos.
      const clave = resolve(juego.installDir.trim().replace(/[\\/]+$/, '')).toLowerCase();
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      out.push(juego);
    }
    return out;
  }

  private leerCache(): CacheEnDisco | null {
    try {
      const raw = JSON.parse(readFileSync(this.cachePath, 'utf8')) as Partial<CacheEnDisco>;
      if (typeof raw.huella !== 'string' || typeof raw.index !== 'object' || raw.index === null) {
        return null;
      }
      return { huella: raw.huella, index: raw.index };
    } catch {
      return null; // sin caché (primer arranque) o caché corrupto: se reconstruye
    }
  }

  private escribirCache(cache: CacheEnDisco): void {
    try {
      writeFileSync(this.cachePath, JSON.stringify(cache), 'utf8');
    } catch (err) {
      this.log(`[games] no se pudo escribir el caché: ${err instanceof Error ? err.message : err}`);
    }
  }
}
