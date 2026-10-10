import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomGame, GameIndex, RunningGameMatch } from '@shared/games';
import type { InstalledGame } from '../../games/types';
import {
  CADUCIDAD_NO_VERIFICADA_MS,
  IconService,
  MAX_CLAVES,
  REINTENTO_NULL_MS,
  dentroDe,
  hashFuente,
  type DependenciasIconos,
} from '../servicio';

let raiz: string;
let cacheDir: string;

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'gameclip-icons-'));
  cacheDir = join(raiz, 'cache');
});
afterEach(() => rmSync(raiz, { recursive: true, force: true }));

/** Firma PNG + relleno: pasa la comprobación de la caché en disco. */
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('png')]);
const url = (b: Buffer): string => `data:image/png;base64,${b.toString('base64')}`;

/** Crea un archivo (y sus carpetas) dentro del dir temporal; devuelve su ruta. */
function archivo(rel: string, contenido = 'x'): string {
  const ruta = join(raiz, rel);
  mkdirSync(join(ruta, '..'), { recursive: true });
  writeFileSync(ruta, contenido);
  return ruta;
}

interface Estado {
  index: GameIndex;
  installed: InstalledGame[];
  customGames: CustomGame[];
  running: RunningGameMatch[];
  procesos: Record<string, string | string[]>;
}

function crear(estado: Partial<Estado> = {}, extra: Partial<DependenciasIconos> = {}) {
  const e: Estado = {
    index: {},
    installed: [],
    customGames: [],
    running: [],
    procesos: {},
    ...estado,
  };
  const deps = {
    cacheDir,
    iconoDeArchivo: vi.fn<(ruta: string) => Promise<Buffer | null>>(async () => PNG),
    imagenDeArchivo: vi.fn(
      async (ruta: string): Promise<Buffer | null> => Buffer.concat([PNG, Buffer.from(ruta)]),
    ),
    index: () => e.index,
    installed: () => e.installed,
    customGames: () => e.customGames,
    runningGames: () => e.running,
    rutaDeProceso: vi.fn(async (claves: string[]) =>
      claves.flatMap((c) => {
        const r = e.procesos[c];
        return r === undefined ? [] : Array.isArray(r) ? r : [r];
      }),
    ),
    indiceListo: vi.fn(async () => {}),
    exesDeCarpeta: vi.fn(async (dir: string) => {
      const out: string[] = [];
      const walk = (d: string): void => {
        for (const ent of readdirSync(d, { withFileTypes: true })) {
          if (ent.isDirectory()) walk(join(d, ent.name));
          else if (ent.name.endsWith('.exe')) out.push(join(d, ent.name));
        }
      };
      walk(dir);
      return out;
    }),
    carpetaDePaquete: vi.fn<(familia: string) => Promise<string | null>>(async () => null),
    ...extra,
  };
  return { servicio: new IconService(deps), deps, estado: e };
}

describe('IconService — nombre de juego → icono', () => {
  it('juego instalado: elige el exe representativo de su carpeta (no el launcher)', async () => {
    archivo('Juego/JuegoLauncher.exe');
    const exe = archivo('Juego/Bin/Mi Juego.exe');
    const { servicio, deps } = crear({
      index: { juegolauncher: 'Mi Juego', 'mi juego': 'Mi Juego' },
      installed: [{ name: 'Mi Juego', installDir: join(raiz, 'Juego'), source: 'steam' }],
    });
    expect(await servicio.forGame('mi juego')).toBe(url(PNG));
    expect(deps.iconoDeArchivo).toHaveBeenCalledWith(exe);
  });

  it('el índice no impone su orden y los exes que no tiene (ambiguos) quedan fuera', async () => {
    // Ningún nombre se parece al del juego: decide solo el filtro del índice.
    archivo('Juego/aaa.exe'); // ambiguo: el índice no lo tiene (y sería el preferido por profundidad)
    const exe = archivo('Juego/sub/zzz.exe');
    const { servicio, deps } = crear({
      index: { zzz: 'Título Distinto' },
      installed: [{ name: 'Título Distinto', installDir: join(raiz, 'Juego'), source: 'steam' }],
    });
    expect(await servicio.forGame('Título Distinto')).toBe(url(PNG));
    expect(deps.iconoDeArchivo).toHaveBeenCalledWith(exe);
  });

  it('si el índice no le asigna ningún exe de su carpeta, null (no se queda con exes ajenos)', async () => {
    // Dos juegos en la misma carpeta: los exes son del otro.
    archivo('Comun/otro.exe');
    const { servicio, deps } = crear({
      index: { otro: 'Otro Juego' },
      installed: [{ name: 'Mío', installDir: join(raiz, 'Comun'), source: 'registry' }],
    });
    expect(await servicio.forGame('Mío')).toBeNull();
    expect(deps.iconoDeArchivo).not.toHaveBeenCalled();
  });

  it('con un mismo nombre dos veces en installed(), prueba cada carpeta', async () => {
    const exe = archivo('B/juego.exe');
    const { servicio, deps } = crear({
      index: { juego: 'Juego' },
      installed: [
        { name: 'Juego', installDir: join(raiz, 'A'), source: 'steam' },
        { name: 'Juego', installDir: join(raiz, 'B'), source: 'epic' },
      ],
    });
    expect(await servicio.forGame('Juego')).toBe(url(PNG));
    expect(deps.iconoDeArchivo).toHaveBeenCalledWith(exe);
  });

  it('juego instalado y en ejecución: la ruta del proceso solo vale si está en su carpeta', async () => {
    const ajeno = archivo('OtroSitio/game.exe'); // otro juego cuyo exe se llama igual
    const propio = archivo('Juego/game.exe');
    const { servicio, deps } = crear({
      index: { game: 'Juego' },
      installed: [{ name: 'Juego', installDir: join(raiz, 'Juego'), source: 'steam' }],
      running: [{ name: 'Juego', executable: 'game.exe' }],
      procesos: { game: [ajeno] },
    });
    expect(await servicio.forGame('Juego')).toBe(url(PNG));
    expect(deps.iconoDeArchivo).toHaveBeenCalledWith(propio);
    expect(deps.iconoDeArchivo).not.toHaveBeenCalledWith(ajeno);
  });

  it('espera al índice de launchers antes de consultar procesos', async () => {
    let listo!: () => void;
    const indice = new Promise<void>((r) => (listo = r));
    const exe = archivo('Juego/game.exe');
    const { servicio, deps, estado } = crear(
      { running: [{ name: 'Juego', executable: 'game.exe' }], procesos: { game: exe } },
      { indiceListo: vi.fn(() => indice) },
    );
    const pedido = servicio.forGame('Juego');
    await new Promise((r) => setTimeout(r, 0));
    expect(deps.rutaDeProceso).not.toHaveBeenCalled();
    // Cargó el índice: el juego es de un launcher y su carpeta manda, sin preguntar a los procesos
    // por el exe del índice.
    estado.index = { game: 'Juego' };
    estado.installed = [{ name: 'Juego', installDir: join(raiz, 'Juego'), source: 'steam' }];
    estado.running = [];
    listo();
    expect(await pedido).toBe(url(PNG));
    expect(deps.rutaDeProceso).not.toHaveBeenCalled();
  });

  it('juego en ejecución: usa la ruta del proceso real', async () => {
    const exe = archivo('Otro/pioneergame.exe');
    const { servicio, deps } = crear({
      running: [{ name: 'ARC Raiders', executable: 'pioneergame.exe' }],
      procesos: { pioneergame: exe },
    });
    expect(await servicio.forGame('ARC Raiders')).toBe(url(PNG));
    expect(deps.rutaDeProceso).toHaveBeenCalledWith(['pioneergame']);
    expect(deps.iconoDeArchivo).toHaveBeenCalledWith(exe);
  });

  it('juego manual (solo nombre de exe): por proceso en ejecución; si no corre, null', async () => {
    const exe = archivo('Manual/MilesMorales.exe');
    let t = 0;
    const { servicio, estado } = crear(
      { customGames: [{ executable: 'MilesMorales.exe', name: 'Spider-Man' }] },
      { ahora: () => t },
    );
    expect(await servicio.forGame('Spider-Man')).toBeNull();
    // Arranca el juego: pasado el tiempo de reintento del null, ya hay ruta e icono.
    estado.procesos.milesmorales = exe;
    t += REINTENTO_NULL_MS;
    expect(await servicio.forGame('spider-man')).toBe(url(PNG));
  });

  it('juego desconocido → null sin extraer nada', async () => {
    const { servicio, deps } = crear();
    expect(await servicio.forGame('No existe')).toBeNull();
    expect(deps.iconoDeArchivo).not.toHaveBeenCalled();
  });

  it('entrada inválida del IPC → null', async () => {
    const { servicio, deps } = crear();
    expect(await servicio.forGame('')).toBeNull();
    expect(await servicio.forGame(123)).toBeNull();
    expect(await servicio.forGame(undefined)).toBeNull();
    expect(await servicio.forExe('C:\\Windows\\System32\\cmd.exe')).toBeNull();
    expect(await servicio.forExe({ executable: 'x' })).toBeNull();
    expect(deps.rutaDeProceso).not.toHaveBeenCalled();
  });
});

describe('IconService — ejecutable suelto → icono', () => {
  it('app en ejecución (audio): icono de su exe', async () => {
    const exe = archivo('Discord/Discord.exe');
    const { servicio, deps } = crear({ procesos: { discord: exe } });
    expect(await servicio.forExe('Discord.exe')).toBe(url(PNG));
    expect(deps.iconoDeArchivo).toHaveBeenCalledWith(exe);
  });

  it('exe del índice que no corre: lo busca en la carpeta de su juego', async () => {
    const exe = archivo('Juego/Binaries/juego-shipping.exe');
    const { servicio, deps } = crear({
      index: { 'juego-shipping': 'Juego' },
      installed: [{ name: 'Juego', installDir: join(raiz, 'Juego'), source: 'epic' }],
    });
    expect(await servicio.forExe('juego-shipping.exe')).toBe(url(PNG));
    expect(deps.iconoDeArchivo).toHaveBeenCalledWith(exe);
    expect(deps.rutaDeProceso).not.toHaveBeenCalled();
  });

  it('exe de un juego instalado que no está en su carpeta: solo vale un proceso desde ella', async () => {
    const ajeno = archivo('Otro/game.exe');
    const { servicio, deps, estado } = crear({
      index: { game: 'Juego' },
      installed: [{ name: 'Juego', installDir: join(raiz, 'SinMontar'), source: 'steam' }],
      procesos: { game: [ajeno] },
    });
    expect(await servicio.forExe('game.exe')).toBeNull();
    expect(deps.iconoDeArchivo).not.toHaveBeenCalled();

    // Corre desde su carpeta: ese sí.
    const propio = archivo('SinMontar/game.exe');
    estado.procesos.game = [ajeno, propio];
    const otro = crear({ ...estado });
    expect(await otro.servicio.forExe('game.exe')).toBe(url(PNG));
    expect(otro.deps.iconoDeArchivo).toHaveBeenCalledWith(propio);
  });

  it('exe inexistente en disco → null', async () => {
    const { servicio, deps } = crear({ procesos: { fantasma: join(raiz, 'no-esta.exe') } });
    expect(await servicio.forExe('fantasma.exe')).toBeNull();
    expect(deps.iconoDeArchivo).not.toHaveBeenCalled();
  });
});

describe('IconService — extracción y cachés', () => {
  it('peticiones simultáneas → una sola extracción', async () => {
    const exe = archivo('App/app.exe');
    const { servicio, deps } = crear({ procesos: { app: exe } });
    const resultados = await Promise.all([
      servicio.forExe('app.exe'),
      servicio.forExe('APP'),
      servicio.forExe('app.exe'),
    ]);
    expect(new Set(resultados)).toEqual(new Set([url(PNG)]));
    expect(deps.iconoDeArchivo).toHaveBeenCalledTimes(1);
  });

  it('la caché en disco se reutiliza entre sesiones; si el exe cambia, se re-extrae', async () => {
    const exe = archivo('App/app.exe', 'v1');
    const primera = crear({ procesos: { app: exe } });
    expect(await primera.servicio.forExe('app.exe')).toBe(url(PNG));
    expect(readdirSync(cacheDir)).toHaveLength(1);

    const segunda = crear({ procesos: { app: exe } });
    expect(await segunda.servicio.forExe('app.exe')).toBe(url(PNG));
    expect(segunda.deps.iconoDeArchivo).not.toHaveBeenCalled();

    writeFileSync(exe, 'versión 2, más larga'); // cambia tamaño (y fecha): la firma ya no cuadra
    const tercera = crear({ procesos: { app: exe } });
    await tercera.servicio.forExe('app.exe');
    expect(tercera.deps.iconoDeArchivo).toHaveBeenCalledTimes(1);
  });

  it('la caché en memoria evita volver a tocar disco y procesos', async () => {
    const exe = archivo('App/app.exe');
    const { servicio, deps } = crear({ procesos: { app: exe } });
    await servicio.forExe('app.exe');
    await servicio.forExe('app.exe');
    expect(deps.rutaDeProceso).toHaveBeenCalledTimes(1);
  });

  it('un null se reintenta solo pasado REINTENTO_NULL_MS', async () => {
    let t = 0;
    const { servicio, deps } = crear({}, { ahora: () => t });
    await servicio.forExe('nada.exe');
    await servicio.forExe('nada.exe');
    expect(deps.rutaDeProceso).toHaveBeenCalledTimes(1);
    t += REINTENTO_NULL_MS;
    await servicio.forExe('nada.exe');
    expect(deps.rutaDeProceso).toHaveBeenCalledTimes(2);
  });

  it('error de getFileIcon → null (y no se guarda nada en disco)', async () => {
    const exe = archivo('App/app.exe');
    const { servicio } = crear(
      { procesos: { app: exe } },
      {
        iconoDeArchivo: vi.fn(async () => {
          throw new Error('getFileIcon falló');
        }),
      },
    );
    expect(await servicio.forExe('app.exe')).toBeNull();
    expect(readdirSync(raiz)).not.toContain('cache');
  });

  it('imagen vacía → null', async () => {
    const exe = archivo('App/app.exe');
    const { servicio } = crear(
      { procesos: { app: exe } },
      { iconoDeArchivo: vi.fn(async () => null) },
    );
    expect(await servicio.forExe('app.exe')).toBeNull();
  });

  it('un PNG roto en la caché de disco se descarta y se vuelve a extraer', async () => {
    const exe = archivo('App/app.exe');
    const info = statSync(exe);
    const nombre = `${hashFuente({ ruta: exe, firma: `${info.mtimeMs}:${info.size}` })}.png`;
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, nombre), 'basura a medias');
    const { servicio, deps } = crear({ procesos: { app: exe } });
    expect(await servicio.forExe('app.exe')).toBe(url(PNG));
    expect(deps.iconoDeArchivo).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(cacheDir, nombre))).toEqual(PNG);
  });

  it('un PNG que la imagen no carga (pngValido) también se descarta', async () => {
    const exe = archivo('App/app.exe');
    await crear({ procesos: { app: exe } }).servicio.forExe('app.exe');
    const { servicio, deps } = crear({ procesos: { app: exe } }, { pngValido: () => false });
    expect(await servicio.forExe('app.exe')).toBe(url(PNG));
    expect(deps.iconoDeArchivo).toHaveBeenCalledTimes(1);
  });

  it('al arrancar borra los temporales huérfanos de un cierre brusco', async () => {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, 'abc.png.123.x.tmp'), 'a medias');
    writeFileSync(join(cacheDir, 'bueno.png'), PNG);
    const exe = archivo('App/app.exe');
    await crear({ procesos: { app: exe } }).servicio.forExe('app.exe');
    const archivos = readdirSync(cacheDir);
    expect(archivos.filter((f) => f.endsWith('.tmp'))).toEqual([]);
    expect(archivos).toContain('bueno.png');
  });

  it('la escritura en disco es atómica: no quedan temporales', async () => {
    const exe = archivo('App/app.exe');
    await crear({ procesos: { app: exe } }).servicio.forExe('app.exe');
    expect(readdirSync(cacheDir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    expect(readdirSync(cacheDir)).toHaveLength(1);
  });

  it('un recorrido de carpeta vacío (disco sin montar) no se recuerda', async () => {
    let t = 0;
    const dir = join(raiz, 'Unidad');
    const { servicio, deps } = crear(
      {
        index: { juego: 'Juego' },
        installed: [{ name: 'Juego', installDir: dir, source: 'steam' }],
      },
      { ahora: () => t },
    );
    expect(await servicio.forGame('Juego')).toBeNull();
    const exe = archivo('Unidad/juego.exe'); // se monta la unidad
    t += REINTENTO_NULL_MS;
    expect(await servicio.forGame('Juego')).toBe(url(PNG));
    expect(deps.exesDeCarpeta).toHaveBeenCalledTimes(2);
    expect(deps.iconoDeArchivo).toHaveBeenCalledWith(exe);
  });

  it('un icono de ruta no verificada (proceso) caduca; uno verificado (carpeta) no', async () => {
    let t = 0;
    archivo('Juego/juego.exe');
    const app = archivo('App/app.exe');
    const { servicio, deps } = crear(
      {
        procesos: { app },
        index: { juego: 'Juego' },
        installed: [{ name: 'Juego', installDir: join(raiz, 'Juego'), source: 'steam' }],
      },
      { ahora: () => t },
    );
    await servicio.forExe('app.exe');
    await servicio.forGame('Juego');
    t += CADUCIDAD_NO_VERIFICADA_MS;
    await servicio.forExe('app.exe');
    await servicio.forGame('Juego');
    expect(deps.rutaDeProceso).toHaveBeenCalledTimes(2); // app: se volvió a resolver
    expect(deps.exesDeCarpeta).toHaveBeenCalledTimes(1); // juego: sigue en memoria
  });

  it('la memoria tiene tope: pasado MAX_CLAVES se olvida lo más antiguo', async () => {
    const { servicio, deps } = crear();
    for (let i = 0; i <= MAX_CLAVES; i++) await servicio.forExe(`app${i}.exe`);
    expect(deps.rutaDeProceso).toHaveBeenCalledTimes(MAX_CLAVES + 1);
    await servicio.forExe(`app${MAX_CLAVES}.exe`); // reciente: en memoria
    expect(deps.rutaDeProceso).toHaveBeenCalledTimes(MAX_CLAVES + 1);
    await servicio.forExe('app0.exe'); // la más antigua: descartada
    expect(deps.rutaDeProceso).toHaveBeenCalledTimes(MAX_CLAVES + 2);
  });

  it('no poder escribir la caché en disco no quita el icono', async () => {
    const exe = archivo('App/app.exe');
    writeFileSync(join(raiz, 'bloqueo'), 'soy un archivo, no una carpeta');
    const { servicio } = crear({ procesos: { app: exe } }, { cacheDir: join(raiz, 'bloqueo', 'x') });
    expect(await servicio.forExe('app.exe')).toBe(url(PNG));
  });
});

describe('IconService — apps de Microsoft Store', () => {
  const MANIFIESTO = `<?xml version="1.0" encoding="utf-8"?>
<Package><Properties><Logo>Assets\\StoreLogo.png</Logo></Properties>
<Applications><Application Id="App" Executable="App.exe">
<uap:VisualElements DisplayName="App" Square150x150Logo="Assets\\Square150x150Logo.png"
  Square44x44Logo="Assets\\Square44x44Logo.png" /></Application></Applications></Package>`;

  function paquete(dir: string): string {
    archivo(`${dir}/AppxManifest.xml`, MANIFIESTO);
    archivo(`${dir}/Assets/Square44x44Logo.scale-200.png`);
    archivo(`${dir}/Assets/Square44x44Logo.targetsize-64_altform-unplated.png`);
    archivo(`${dir}/Assets/Square44x44Logo.targetsize-64_altform-lightunplated.png`);
    return join(raiz, dir);
  }

  it('exe real dentro del paquete: logo del manifiesto (sin pasar por getFileIcon)', async () => {
    const pkg = paquete('WindowsApps/Spotify_1.0_x64__zpdnekdrzrea0');
    const exe = archivo('WindowsApps/Spotify_1.0_x64__zpdnekdrzrea0/Spotify.exe');
    const { servicio, deps } = crear({ procesos: { spotify: exe } });
    const logo = join(pkg, 'Assets', 'Square44x44Logo.targetsize-64_altform-unplated.png');
    expect(await servicio.forExe('Spotify.exe')).toBe(url(Buffer.concat([PNG, Buffer.from(logo)])));
    expect(deps.imagenDeArchivo).toHaveBeenCalledWith(logo);
    expect(deps.iconoDeArchivo).not.toHaveBeenCalled();
  });

  it('alias de ejecución: pregunta la carpeta del paquete por su familia', async () => {
    const pkg = paquete('Program Files/WindowsApps/SpotifyAB.SpotifyMusic_1.2_x64__zpdnekdrzrea0');
    const alias = join(
      raiz,
      'Local/Microsoft/WindowsApps/SpotifyAB.SpotifyMusic_zpdnekdrzrea0/Spotify.exe',
    );
    const { servicio, deps } = crear(
      { procesos: { spotify: alias } },
      { carpetaDePaquete: vi.fn(async () => pkg) },
    );
    expect(await servicio.forExe('Spotify.exe')).toMatch(/^data:image\/png;base64,/);
    expect(deps.carpetaDePaquete).toHaveBeenCalledWith('SpotifyAB.SpotifyMusic_zpdnekdrzrea0');
  });

  it('paquete sin manifiesto legible: cae al icono del exe', async () => {
    const exe = archivo('WindowsApps/Roto_1.0_x64__abc/Roto.exe');
    const { servicio, deps } = crear({ procesos: { roto: exe } });
    expect(await servicio.forExe('Roto.exe')).toBe(url(PNG));
    expect(deps.iconoDeArchivo).toHaveBeenCalledWith(exe);
  });
});

describe('dentroDe', () => {
  it('compara carpetas sin distinguir mayúsculas ni confundir prefijos', () => {
    expect(dentroDe('D:\\Juegos\\A\\a.exe', 'd:\\juegos\\a')).toBe(true);
    expect(dentroDe('D:\\Juegos\\A\\a.exe', 'D:\\Juegos\\A\\')).toBe(true);
    expect(dentroDe('D:\\Juegos\\AB\\a.exe', 'D:\\Juegos\\A')).toBe(false);
  });
});
