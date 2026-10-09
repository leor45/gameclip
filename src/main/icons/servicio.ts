import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, parse as parsePath } from 'node:path';
import { KNOWN_GAME_PROCESSES, exeKey, resolveGameName } from '@shared/games';
import type { CustomGame, GameIndex, RunningGameMatch } from '@shared/games';
import type { InstalledGame } from '../games/types';
import {
  claveNombre,
  elegirArchivoLogo,
  elegirEjecutable,
  esRutaStore,
  familiaDeAlias,
  logoDelManifiesto,
  validarEjecutable,
  validarNombreJuego,
} from './elegir';

/**
 * Servicio de iconos: el icono oficial de un juego (por su nombre) o de una app (por el nombre de su
 * `.exe`), como data URL PNG de hasta 64 px. `null` = sin icono (el renderer pone el logo de GameClip).
 *
 * Flujo: nombre → ruta del `.exe` (con datos del main, nunca rutas del renderer) → fuente de la imagen
 * (el propio exe, o el logo del paquete si es una app de la Store) → PNG → caché en disco y memoria.
 *
 * Todo es perezoso (solo cuando la UI lo pide) y una vez por ejecutable: la app corre mientras se
 * juega, así que nada de esto toca el sondeo de procesos ni bloquea el hilo principal (solo
 * `fs/promises`). Ningún error sale de aquí: cualquier fallo es `null`.
 */

/** Lado máximo del icono que se entrega. */
export const LADO_ICONO = 64;

/** Un «sin icono» se recuerda este tiempo: el renderer no cachea los null y vuelve a pedir. */
export const REINTENTO_NULL_MS = 30_000;

/** Lo que el servicio necesita del sistema. Todo inyectable: los tests no dependen de Electron. */
export interface DependenciasIconos {
  /** Carpeta de la caché en disco (`userData/icons`). */
  cacheDir: string;
  /** Icono del shell de un archivo, ya reducido a ≤ 64 px, como PNG; null si está vacío. */
  iconoDeArchivo: (ruta: string) => Promise<Buffer | null>;
  /** Una imagen (PNG del paquete) reducida a ≤ 64 px, como PNG; null si está vacía. */
  imagenDeArchivo: (ruta: string) => Promise<Buffer | null>;
  /** Índice de juegos vigente (`ejecutable → nombre`). */
  index: () => GameIndex;
  /** Juegos instalados según los launchers (con su carpeta). */
  installed: () => InstalledGame[];
  /** Juegos añadidos a mano en Ajustes. */
  customGames: () => CustomGame[];
  /** Juegos en ejecución ahora (con el exe real que vio el detector). */
  runningGames: () => RunningGameMatch[];
  /** Ruta de un proceso en ejecución de esas claves `exeKey`, o null. */
  rutaDeProceso: (claves: string[]) => Promise<string | null>;
  /** Rutas completas de los `.exe` de la carpeta de un juego (mismas reglas que el índice). */
  exesDeCarpeta: (dir: string) => Promise<string[]>;
  /** `InstallLocation` de un paquete de la Store por su `PackageFamilyName`, o null. */
  carpetaDePaquete: (familia: string) => Promise<string | null>;
  log?: (msg: string) => void;
  ahora?: () => number;
}

interface EntradaMemo {
  promesa: Promise<string | null>;
  resuelta: boolean;
  resultado: string | null;
  /** Cuándo se resolvió (para la ventana de reintento de los null). */
  en: number;
}

interface FuenteImagen {
  tipo: 'exe' | 'png';
  ruta: string;
  /** Firma del archivo (fecha + tamaño): si cambia, el icono en disco no vale. */
  firma: string;
}

export class IconService {
  private readonly deps: DependenciasIconos;
  private readonly log: (msg: string) => void;
  private readonly ahora: () => number;
  /** Icono por clave de petición (`game:…` / `exe:…`). Guarda la promesa: lo simultáneo se comparte. */
  private readonly porClave = new Map<string, EntradaMemo>();
  /** Icono por ruta de exe (dos claves que llevan al mismo exe extraen una vez). */
  private readonly porRuta = new Map<string, Promise<string | null>>();
  /** Exes de la carpeta de cada juego (el recorrido del disco se hace una vez por carpeta). */
  private readonly exesPorCarpeta = new Map<string, Promise<string[]>>();
  /** Carpeta de cada paquete de la Store (una consulta por familia). */
  private readonly paquetes = new Map<string, Promise<string | null>>();
  private cacheDirLista: Promise<void> | null = null;

  constructor(deps: DependenciasIconos) {
    this.deps = deps;
    this.log = deps.log ?? (() => {});
    this.ahora = deps.ahora ?? Date.now;
  }

  /** Icono de un juego por su nombre visible. Entrada del IPC: se valida aquí. */
  forGame(nombre: unknown): Promise<string | null> {
    const valido = validarNombreJuego(nombre);
    if (!valido) return Promise.resolve(null);
    return this.memo(`game:${claveNombre(valido)}`, () => this.rutaDeJuego(valido));
  }

  /** Icono de un ejecutable suelto (`Discord.exe`). Entrada del IPC: solo nombres, nunca rutas. */
  forExe(ejecutable: unknown): Promise<string | null> {
    const clave = validarEjecutable(ejecutable);
    if (!clave) return Promise.resolve(null);
    return this.memo(`exe:${clave}`, () => this.rutaDeExe(clave));
  }

  /**
   * Caché en memoria por clave de petición. Un acierto vale para siempre; un null, solo
   * `REINTENTO_NULL_MS` (el juego puede arrancar luego y entonces sí habrá ruta).
   */
  private memo(clave: string, resolverRuta: () => Promise<string | null>): Promise<string | null> {
    const previo = this.porClave.get(clave);
    // Se reutiliza si sigue en vuelo, si dio icono, o si el null es reciente.
    if (
      previo &&
      (!previo.resuelta || previo.resultado !== null || this.ahora() - previo.en < REINTENTO_NULL_MS)
    ) {
      return previo.promesa;
    }
    const entrada: EntradaMemo = {
      promesa: (async () => {
        try {
          const ruta = await resolverRuta();
          return ruta ? await this.iconoDeRuta(ruta) : null;
        } catch (err) {
          this.log(`[icons] ${clave}: ${err instanceof Error ? err.message : err}`);
          return null;
        }
      })(),
      resuelta: false,
      resultado: null,
      en: 0,
    };
    void entrada.promesa.then((r) => {
      entrada.resuelta = true;
      entrada.resultado = r;
      // El null se fecha al terminar (una resolución lenta no consume la ventana de reintento).
      entrada.en = this.ahora();
    });
    this.porClave.set(clave, entrada);
    return entrada.promesa;
  }

  // ---------------------------------------------------------------- nombre → ruta del ejecutable

  /**
   * Ruta del `.exe` de un juego por su nombre visible:
   *
   *   1. si está en ejecución, la ruta de su proceso real (el exe exacto que se está capturando);
   *   2. si un launcher lo declara, el exe más representativo de su carpeta: entre los que el índice
   *      asigna a ese juego (los ambiguos no), con preferencia por el que se ve en ejecución y los de
   *      los juegos manuales y la lista curada (ver `elegirEjecutable`);
   *   3. si no, la ruta de cualquier proceso en ejecución de los exes que se resuelven a ese nombre
   *      (juegos manuales y de la lista curada, que no tienen carpeta).
   */
  private async rutaDeJuego(nombre: string): Promise<string | null> {
    const clave = claveNombre(nombre);
    const enEjecucion = this.deps
      .runningGames()
      .filter((g) => claveNombre(g.name) === clave)
      .map((g) => exeKey(g.executable));
    const { fuertes, delIndice } = this.exesDelNombre(clave);

    if (enEjecucion.length > 0) {
      const ruta = await this.deps.rutaDeProceso(enEjecucion);
      if (ruta) return ruta;
    }

    const instalado = this.deps.installed().find((j) => claveNombre(j.name) === clave);
    if (instalado) {
      const rutas = await this.exesDe(instalado.installDir);
      // El índice ya descartó los exes ambiguos (compartidos con otro juego): se respetan. Si no queda
      // ninguno (índice aún sin construir), valen todos los de la carpeta.
      const indexados = rutas.filter((r) => delIndice.has(exeKey(r)));
      const elegida = elegirEjecutable(instalado.name, indexados.length > 0 ? indexados : rutas, {
        preferidas: [...enEjecucion, ...fuertes],
      });
      if (elegida) return elegida;
    }

    const candidatos = [...new Set([...fuertes, ...delIndice])];
    if (candidatos.length > 0) return this.deps.rutaDeProceso(candidatos);
    return null;
  }

  /**
   * Claves `exeKey` que se resuelven a ese nombre. `fuertes`: las de los juegos manuales y la lista
   * curada, que designan el proceso real del juego. `delIndice`: las del índice, que son TODOS los exes
   * de su carpeta (no dicen cuál es el bueno, solo cuáles son suyos).
   */
  private exesDelNombre(clave: string): { fuertes: string[]; delIndice: Set<string> } {
    const index = this.deps.index();
    const customGames = this.deps.customGames();
    const ctx = { index, customGames };
    const fuertes: string[] = [];
    for (const juego of customGames) {
      if (claveNombre(resolveGameName(juego.executable, ctx)) === clave) {
        fuertes.push(exeKey(juego.executable));
      }
    }
    for (const [exe, nombre] of Object.entries(KNOWN_GAME_PROCESSES)) {
      if (claveNombre(nombre) === clave) fuertes.push(exe);
    }
    const delIndice = new Set<string>();
    for (const [exe, nombre] of Object.entries(index)) {
      if (claveNombre(nombre) === clave) delIndice.add(exe);
    }
    return { fuertes: [...new Set(fuertes.filter(Boolean))], delIndice };
  }

  /**
   * Ruta de un exe suelto: el proceso en ejecución (apps de audio, juegos manuales); si no corre y el
   * índice sabe de qué juego es, el exe de ese juego en su carpeta.
   */
  private async rutaDeExe(clave: string): Promise<string | null> {
    const enProceso = await this.deps.rutaDeProceso([clave]);
    if (enProceso) return enProceso;

    const nombre = this.deps.index()[clave];
    const instalado = nombre
      ? this.deps.installed().find((j) => claveNombre(j.name) === claveNombre(nombre))
      : undefined;
    if (!instalado) return null;
    const rutas = await this.exesDe(instalado.installDir);
    return rutas.find((r) => exeKey(r) === clave) ?? null;
  }

  private exesDe(dir: string): Promise<string[]> {
    const clave = dir.trim().toLowerCase();
    let promesa = this.exesPorCarpeta.get(clave);
    if (!promesa) {
      promesa = this.deps.exesDeCarpeta(dir).catch(() => []);
      this.exesPorCarpeta.set(clave, promesa);
    }
    return promesa;
  }

  // ---------------------------------------------------------------- ruta → icono

  /** Icono de un exe, una vez por ruta en toda la sesión. */
  private iconoDeRuta(ruta: string): Promise<string | null> {
    const clave = ruta.toLowerCase();
    let promesa = this.porRuta.get(clave);
    if (!promesa) {
      promesa = this.extraer(ruta).catch((err) => {
        this.log(`[icons] ${ruta}: ${err instanceof Error ? err.message : err}`);
        return null;
      });
      this.porRuta.set(clave, promesa);
      // Un fallo no se queda para siempre: el archivo puede aparecer (unidad que se conecta).
      void promesa.then((r) => {
        if (r === null && this.porRuta.get(clave) === promesa) this.porRuta.delete(clave);
      });
    }
    return promesa;
  }

  private async extraer(ruta: string): Promise<string | null> {
    const fuente = await this.fuenteDe(ruta);
    if (!fuente) return null;

    const archivo = join(this.deps.cacheDir, `${hashFuente(fuente)}.png`);
    const enDisco = await readFile(archivo).catch(() => null);
    if (enDisco && enDisco.length > 0) return aDataUrl(enDisco);

    const png =
      fuente.tipo === 'png'
        ? await this.deps.imagenDeArchivo(fuente.ruta)
        : await this.deps.iconoDeArchivo(fuente.ruta);
    if (!png || png.length === 0) return null;
    await this.guardar(archivo, png);
    return aDataUrl(png);
  }

  /**
   * De dónde sale la imagen. Un exe normal: el propio exe. Una app de la Store: su `.exe` no trae
   * icono (o es un alias de 0 bytes), así que se usa el logo del paquete; si eso falla, se intenta el
   * exe igualmente. Un exe que no existe: null.
   */
  private async fuenteDe(ruta: string): Promise<FuenteImagen | null> {
    if (esRutaStore(ruta)) {
      const logo = await this.logoDePaquete(ruta).catch(() => null);
      if (logo) return logo;
    }
    const info = await stat(ruta).catch(() => null);
    if (!info?.isFile()) return null;
    return { tipo: 'exe', ruta, firma: `${info.mtimeMs}:${info.size}` };
  }

  /** Logo del paquete de una app de la Store (best-effort; null si algo no cuadra). */
  private async logoDePaquete(ruta: string): Promise<FuenteImagen | null> {
    const carpeta = await this.carpetaDelPaquete(ruta);
    if (!carpeta) return null;
    const xml = await readFile(join(carpeta, 'AppxManifest.xml'), 'utf8').catch(() => null);
    if (!xml) return null;
    const logo = logoDelManifiesto(xml);
    if (!logo) return null;

    const relativo = logo.replace(/[\\/]+/g, '\\');
    const dirLogo = join(carpeta, dirname(relativo));
    const archivos = await readdir(dirLogo).catch(() => [] as string[]);
    const elegido = elegirArchivoLogo(parsePath(relativo).base, archivos);
    if (!elegido) return null;
    const png = join(dirLogo, elegido);
    const info = await stat(png).catch(() => null);
    if (!info?.isFile()) return null;
    return { tipo: 'png', ruta: png, firma: `${info.mtimeMs}:${info.size}` };
  }

  /**
   * Carpeta del paquete: para un alias de ejecución (`…\Microsoft\WindowsApps\<familia>\X.exe`) se
   * pregunta al sistema por su `InstallLocation`; para un exe real dentro del paquete, se sube por
   * las carpetas hasta la que tiene `AppxManifest.xml`.
   */
  private async carpetaDelPaquete(ruta: string): Promise<string | null> {
    const familia = familiaDeAlias(ruta);
    if (familia) {
      const clave = familia.toLowerCase();
      let promesa = this.paquetes.get(clave);
      if (!promesa) {
        promesa = this.deps.carpetaDePaquete(familia).catch(() => null);
        this.paquetes.set(clave, promesa);
      }
      return promesa;
    }

    let dir = dirname(ruta);
    for (let i = 0; i < 6; i++) {
      const manifiesto = await stat(join(dir, 'AppxManifest.xml')).catch(() => null);
      if (manifiesto?.isFile()) return dir;
      const padre = dirname(dir);
      // Al llegar a la propia `WindowsApps` (o a la raíz) no hay más paquete por encima.
      if (padre === dir || /[\\/]WindowsApps$/i.test(dir)) return null;
      dir = padre;
    }
    return null;
  }

  private async guardar(archivo: string, png: Buffer): Promise<void> {
    try {
      this.cacheDirLista ??= mkdir(this.deps.cacheDir, { recursive: true }).then(() => undefined);
      await this.cacheDirLista;
      await writeFile(archivo, png);
    } catch (err) {
      // Sin caché en disco el icono sale igual; la próxima sesión se vuelve a extraer.
      this.cacheDirLista = null;
      this.log(`[icons] no se pudo guardar ${archivo}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

/** Nombre del PNG en disco: hash de la ruta (sin distinguir mayúsculas) + firma del archivo. */
export function hashFuente(fuente: { ruta: string; firma: string }): string {
  return createHash('sha1').update(`${fuente.ruta.toLowerCase()}|${fuente.firma}`).digest('hex');
}

function aDataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString('base64')}`;
}
