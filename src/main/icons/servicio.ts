import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, parse as parsePath, resolve } from 'node:path';
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
 * `.exe`), como data URL PNG. `null` = sin icono (el renderer pone el logo de GameClip).
 *
 * Tamaño: el icono del shell de un exe (`app.getFileIcon`, `large`) mide 32 px en Windows a escala
 * 100 % y 48 px con más DPI; se entrega tal cual (nunca se amplía). El logo de una app de la Store se
 * reduce a 64 px. Ver `LADO_ICONO`.
 *
 * Flujo: nombre → ruta del `.exe` (con datos del main, nunca rutas del renderer) → fuente de la imagen
 * (el propio exe, o el logo del paquete si es una app de la Store) → PNG → caché en disco y memoria.
 *
 * Todo es perezoso (solo cuando la UI lo pide) y una vez por ejecutable: la app corre mientras se
 * juega, así que nada de esto toca el sondeo de procesos ni bloquea el hilo principal (solo
 * `fs/promises`). Ningún error sale de aquí: cualquier fallo es `null`.
 */

/** Lado máximo: las imágenes mayores se reducen a esto; las menores (iconos de 32/48 px) no se amplían. */
export const LADO_ICONO = 64;

/** Un «sin icono» se recuerda este tiempo: el renderer no cachea los null y vuelve a pedir. */
export const REINTENTO_NULL_MS = 30_000;

/**
 * Un icono sacado de una ruta NO verificada (la de un proceso que se llama igual, sin carpeta de
 * instalación con la que contrastarla) vale solo este tiempo: luego se vuelve a resolver.
 */
export const CADUCIDAD_NO_VERIFICADA_MS = 5 * 60_000;

/** Tope de claves recordadas en memoria; al pasarlo se descarta la más antigua. */
export const MAX_CLAVES = 500;

/** Lo que el servicio necesita del sistema. Todo inyectable: los tests no dependen de Electron. */
export interface DependenciasIconos {
  /** Carpeta de la caché en disco (`userData/icons`). */
  cacheDir: string;
  /** Icono del shell de un archivo como PNG (≤ `LADO_ICONO`); null si está vacío. */
  iconoDeArchivo: (ruta: string) => Promise<Buffer | null>;
  /** Una imagen (PNG del paquete) reducida a ≤ `LADO_ICONO`, como PNG; null si está vacía. */
  imagenDeArchivo: (ruta: string) => Promise<Buffer | null>;
  /** ¿Un PNG leído de la caché en disco se puede usar? Por defecto, que tenga la firma PNG. */
  pngValido?: (png: Buffer) => boolean;
  /** Índice de juegos vigente (`ejecutable → nombre`). */
  index: () => GameIndex;
  /** Juegos instalados según los launchers (con su carpeta), sin los excluidos («no son juegos»). */
  installed: () => InstalledGame[];
  /**
   * Se resuelve cuando el índice de launchers ya está cargado (primer refresco terminado). Hasta
   * entonces no se resuelve nada: sin `installed()` se acabaría preguntando a los procesos por juegos
   * que el índice sabrá ubicar en un momento.
   */
  indiceListo: () => Promise<void>;
  /** Juegos añadidos a mano en Ajustes. */
  customGames: () => CustomGame[];
  /** Juegos en ejecución ahora (con el exe real que vio el detector). */
  runningGames: () => RunningGameMatch[];
  /** Rutas de los procesos en ejecución de esas claves `exeKey` (vacío si no corre ninguno). */
  rutaDeProceso: (claves: string[]) => Promise<string[]>;
  /** Rutas completas de los `.exe` de la carpeta de un juego (mismas reglas que el índice). */
  exesDeCarpeta: (dir: string) => Promise<string[]>;
  /** `InstallLocation` de un paquete de la Store por su `PackageFamilyName`, o null. */
  carpetaDePaquete: (familia: string) => Promise<string | null>;
  log?: (msg: string) => void;
  ahora?: () => number;
}

/** Ruta resuelta y si está contrastada con la carpeta de instalación del juego. */
interface RutaResuelta {
  ruta: string;
  verificada: boolean;
}

interface EntradaMemo {
  promesa: Promise<string | null>;
  /** Hasta cuándo vale (Infinity mientras está en vuelo o si salió de una ruta verificada). */
  caduca: number;
}

interface FuenteImagen {
  tipo: 'exe' | 'png';
  ruta: string;
  /** Firma del archivo (fecha + tamaño): si cambia, el icono en disco no vale. */
  firma: string;
}

const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** ¿La ruta está dentro de la carpeta (o es ella)? Sin distinguir mayúsculas ni separadores. */
export function dentroDe(ruta: string, carpeta: string): boolean {
  const norma = (p: string): string => resolve(p.trim()).replace(/[\\/]+$/, '').toLowerCase();
  const r = norma(ruta);
  const c = norma(carpeta);
  return r === c || r.startsWith(`${c}\\`) || r.startsWith(`${c}/`);
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
  /** Limpieza de temporales huérfanos al arrancar; `guardar` la espera para no pisarse con ella. */
  private readonly limpieza: Promise<void>;

  constructor(deps: DependenciasIconos) {
    this.deps = deps;
    this.log = deps.log ?? (() => {});
    this.ahora = deps.ahora ?? Date.now;
    this.limpieza = this.borrarTemporales();
  }

  /**
   * Borra los `*.tmp` que dejó una escritura cortada (cierre brusco a mitad de `guardar`). Asíncrono y
   * best-effort: si la carpeta no existe o algo falla, no pasa nada.
   */
  private async borrarTemporales(): Promise<void> {
    try {
      const archivos = await readdir(this.deps.cacheDir);
      await Promise.all(
        archivos
          .filter((a) => a.toLowerCase().endsWith('.tmp'))
          .map((a) => rm(join(this.deps.cacheDir, a), { force: true }).catch(() => undefined)),
      );
    } catch {
      // sin carpeta de caché todavía: nada que limpiar
    }
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
   * Caché en memoria por clave de petición. Un icono de ruta verificada vale toda la sesión; uno de
   * ruta no verificada, `CADUCIDAD_NO_VERIFICADA_MS`; un null, `REINTENTO_NULL_MS` (el juego puede
   * arrancar luego y entonces sí habrá ruta). Como mucho `MAX_CLAVES` entradas.
   */
  private memo(clave: string, resolver: () => Promise<RutaResuelta | null>): Promise<string | null> {
    const previo = this.porClave.get(clave);
    if (previo && this.ahora() < previo.caduca) return previo.promesa;
    this.porClave.delete(clave);

    const entrada: EntradaMemo = { promesa: Promise.resolve(null), caduca: Number.POSITIVE_INFINITY };
    entrada.promesa = (async () => {
      let verificada = false;
      let icono: string | null = null;
      try {
        const resuelta = await resolver();
        if (resuelta) {
          verificada = resuelta.verificada;
          icono = await this.iconoDeRuta(resuelta.ruta);
        }
      } catch (err) {
        this.log(`[icons] ${clave}: ${err instanceof Error ? err.message : err}`);
        icono = null;
      }
      // Se fecha al terminar (una resolución lenta no consume la ventana).
      const t = this.ahora();
      entrada.caduca =
        icono === null
          ? t + REINTENTO_NULL_MS
          : verificada
            ? Number.POSITIVE_INFINITY
            : t + CADUCIDAD_NO_VERIFICADA_MS;
      return icono;
    })();

    this.porClave.set(clave, entrada);
    // Tope: el Map conserva el orden de inserción, así que el primero es el más antiguo.
    while (this.porClave.size > MAX_CLAVES) {
      const masAntigua = this.porClave.keys().next().value;
      if (masAntigua === undefined) break;
      this.porClave.delete(masAntigua);
    }
    return entrada.promesa;
  }

  // ---------------------------------------------------------------- nombre → ruta del ejecutable

  /**
   * Ruta del `.exe` de un juego por su nombre visible. Primero se espera al índice de launchers.
   *
   * Si algún launcher declara el juego (su carpeta de instalación es la referencia):
   *   1. si está en ejecución, la ruta de su proceso real, SOLO si cae dentro de esa carpeta;
   *   2. si no, el exe más representativo de la carpeta entre los que el índice asigna a ese juego
   *      (ver `elegirEjecutable`). Si el índice no le asigna ninguno de los de la carpeta, null: serían
   *      exes de otro juego que comparte carpeta (o ambiguos).
   *
   * Si ningún launcher lo declara (juegos manuales y de la lista curada), la ruta de un proceso en
   * ejecución de sus exes. No hay carpeta con la que contrastarla: es una ruta «no verificada».
   */
  private async rutaDeJuego(nombre: string): Promise<RutaResuelta | null> {
    await this.deps.indiceListo();
    const clave = claveNombre(nombre);
    const enEjecucion = this.deps
      .runningGames()
      .filter((g) => claveNombre(g.name) === clave)
      .map((g) => exeKey(g.executable));
    const { fuertes, delIndice } = this.exesDelNombre(clave);

    const instalados = this.deps.installed().filter((j) => claveNombre(j.name) === clave);
    if (instalados.length > 0) {
      const procesos = enEjecucion.length > 0 ? await this.deps.rutaDeProceso(enEjecucion) : [];
      for (const juego of instalados) {
        const propia = procesos.find((r) => dentroDe(r, juego.installDir));
        if (propia) return { ruta: propia, verificada: true };
      }
      for (const juego of instalados) {
        const rutas = await this.exesDe(juego.installDir);
        // El índice ya descartó los exes ambiguos y los de juegos excluidos: se respetan.
        const indexados = rutas.filter((r) => delIndice.has(exeKey(r)));
        const elegida = elegirEjecutable(juego.name, indexados, {
          preferidas: [...enEjecucion, ...fuertes],
        });
        if (elegida) return { ruta: elegida, verificada: true };
      }
      return null;
    }

    const candidatos = [...new Set([...enEjecucion, ...fuertes, ...delIndice])];
    if (candidatos.length === 0) return null;
    const ruta = (await this.deps.rutaDeProceso(candidatos))[0];
    return ruta ? { ruta, verificada: false } : null;
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
   * Ruta de un exe suelto. Si el índice sabe de qué juego es, ese exe dentro de la carpeta del juego
   * (verificada, sin consultar procesos). Si no, la ruta de un proceso en ejecución con ese nombre
   * (apps de audio, juegos manuales): no verificada.
   */
  private async rutaDeExe(clave: string): Promise<RutaResuelta | null> {
    await this.deps.indiceListo();
    const nombre = this.deps.index()[clave];
    const instalados = nombre
      ? this.deps.installed().filter((j) => claveNombre(j.name) === claveNombre(nombre))
      : [];
    for (const juego of instalados) {
      const ruta = (await this.exesDe(juego.installDir)).find((r) => exeKey(r) === clave);
      if (ruta) return { ruta, verificada: true };
    }
    const procesos = await this.deps.rutaDeProceso([clave]);
    if (instalados.length > 0) {
      // El exe es de un juego instalado (p. ej. su disco no respondió al recorrerlo): solo vale un
      // proceso que corra desde su carpeta, nunca otro exe que se llame igual.
      const propia = procesos.find((r) => instalados.some((j) => dentroDe(r, j.installDir)));
      return propia ? { ruta: propia, verificada: true } : null;
    }
    return procesos[0] ? { ruta: procesos[0], verificada: false } : null;
  }

  /** Exes de una carpeta, una vez por sesión. Un recorrido vacío (disco sin montar) no se recuerda. */
  private exesDe(dir: string): Promise<string[]> {
    const clave = dir.trim().toLowerCase();
    let promesa = this.exesPorCarpeta.get(clave);
    if (!promesa) {
      const nueva = this.deps.exesDeCarpeta(dir).catch(() => [] as string[]);
      promesa = nueva;
      this.exesPorCarpeta.set(clave, nueva);
      void nueva.then((rutas) => {
        if (rutas.length === 0 && this.exesPorCarpeta.get(clave) === nueva) {
          this.exesPorCarpeta.delete(clave);
        }
      });
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
    if (enDisco && this.pngUsable(enDisco)) return aDataUrl(enDisco);
    // Un PNG roto (apagón a mitad de escritura de una versión vieja, disco tocado) se descarta.
    if (enDisco) await rm(archivo, { force: true }).catch(() => undefined);

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

  private pngUsable(png: Buffer): boolean {
    if (png.length <= FIRMA_PNG.length || !png.subarray(0, FIRMA_PNG.length).equals(FIRMA_PNG)) {
      return false;
    }
    try {
      return this.deps.pngValido ? this.deps.pngValido(png) : true;
    } catch {
      return false;
    }
  }

  /** Escritura atómica: a un temporal y `rename` (mismo volumen). Nunca queda un PNG a medias. */
  private async guardar(archivo: string, png: Buffer): Promise<void> {
    const temporal = `${archivo}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    try {
      await this.limpieza;
      this.cacheDirLista ??= mkdir(this.deps.cacheDir, { recursive: true }).then(() => undefined);
      await this.cacheDirLista;
      await writeFile(temporal, png);
      await rename(temporal, archivo);
    } catch (err) {
      await rm(temporal, { force: true }).catch(() => undefined);
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
