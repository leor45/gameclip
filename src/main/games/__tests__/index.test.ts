import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameIndexService, huellaDe, indexarEjecutables } from '..';
import { executablesIn } from '../scan';
import type { GameSource, InstalledGame } from '../types';

let raiz: string;

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'gameclip-index-'));
});
afterEach(() => {
  rmSync(raiz, { recursive: true, force: true });
});

/** Crea `<raiz>/<ruta>` con un .exe vacío dentro. */
function exe(...segmentos: string[]): void {
  const full = join(raiz, ...segmentos);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, '');
}

/** Fuente de mentira que declara juegos ya "instalados". */
function fuente(juegos: InstalledGame[], id: GameSource['id'] = 'steam'): GameSource {
  return { id, listInstalledGames: () => Promise.resolve(juegos) };
}

describe('executablesIn', () => {
  it('encuentra los ejecutables aunque estén enterrados en subcarpetas', async () => {
    // El caso Fortnite: el proceso real no es el que declara el manifiesto, vive en Binaries/Win64.
    exe('FortniteGame', 'Binaries', 'Win64', 'FortniteClient-Win64-Shipping.exe');
    exe('PioneerGame.exe');
    expect((await executablesIn(raiz)).sort()).toEqual([
      'fortniteclient-win64-shipping',
      'pioneergame',
    ]);
  });

  it('ignora las carpetas de ruido y los ejecutables auxiliares', async () => {
    exe('MiJuego.exe');
    exe('UnityCrashHandler64.exe');
    exe('unins000.exe');
    exe('_CommonRedist', 'vcredist_x64.exe');
    exe('EasyAntiCheat', 'EasyAntiCheat_Setup.exe');
    exe('DirectX', 'DXSETUP.exe');
    expect(await executablesIn(raiz)).toEqual(['mijuego']);
  });

  it('descarta los helpers del launcher, que corren aunque el juego esté cerrado (regresión)', async () => {
    // `EpicWebHelper.exe` vive en la carpeta de Fortnite pero lo arranca el launcher de Epic:
    // indexarlo hacía que la app detectara Fortnite a todas horas.
    exe('FortniteGame', 'Binaries', 'Win64', 'FortniteClient-Win64-Shipping.exe');
    exe('Engine', 'Binaries', 'Win64', 'EpicWebHelper.exe');
    exe('FortniteLauncher.exe');
    exe('FortniteClient-Win64-Shipping_EAC_EOS.exe');
    expect(await executablesIn(raiz)).toEqual(['fortniteclient-win64-shipping']);
  });

  it('ignora los ejecutables de runtime que comparten muchas apps (regresión)', async () => {
    // QtWebEngineProcess lo lanza GOG Galaxy (y cualquier app Qt); 7za, createdump y los crs-* son
    // herramientas genéricas que el índice real asignaba a Witcher 3, Lossless Scaling y Stellar Blade.
    exe('MiJuego.exe');
    exe('QtWebEngineProcess.exe');
    exe('bin', '7za.exe');
    exe('7z.exe');
    exe('createdump.exe');
    exe('crs-handler.exe');
    exe('crs-uploader.exe');
    expect(await executablesIn(raiz)).toEqual(['mijuego']);
  });

  it('respeta el tope de profundidad', async () => {
    exe('a', 'b', 'c', 'd', 'e', 'Hondo.exe');
    expect(await executablesIn(raiz, 2)).toEqual([]);
  });

  it('una carpeta que no existe no rompe el escaneo', async () => {
    expect(await executablesIn(join(raiz, 'no-existe'))).toEqual([]);
  });
});

describe('indexarEjecutables', () => {
  it('mapea CADA ejecutable del juego a su nombre de catálogo', async () => {
    exe('ARC', 'PioneerGame.exe');
    const juegos: InstalledGame[] = [
      { name: 'ARC Raiders', installDir: join(raiz, 'ARC'), source: 'steam' },
    ];
    expect(await indexarEjecutables(juegos)).toEqual({ pioneergame: 'ARC Raiders' });
  });

  it('un ejecutable que comparten dos juegos es ambiguo: se descarta, no se adivina', async () => {
    // Quedarse con el primero sería peor que nada: bastaría con que ese proceso corriera para
    // detectar el juego equivocado.
    exe('A', 'game.exe');
    exe('A', 'JuegoA.exe');
    exe('B', 'game.exe');
    const ambiguos: string[] = [];
    const index = await indexarEjecutables(
      [
        { name: 'Juego A', installDir: join(raiz, 'A'), source: 'steam' },
        { name: 'Juego B', installDir: join(raiz, 'B'), source: 'epic' },
      ],
      (exeName, nombres) => ambiguos.push(`${exeName}: ${nombres.join('/')}`),
    );
    expect(index).toEqual({ juegoa: 'Juego A' }); // `game` fuera; el propio de A se queda
    expect(ambiguos).toEqual(['game: Juego A/Juego B']);
  });
});

describe('GameIndexService', () => {
  function crear(sources: GameSource[]) {
    return new GameIndexService({ cachePath: join(raiz, 'cache.json'), sources });
  }

  it('construye el índice desde las fuentes', async () => {
    exe('MM', 'MilesMorales.exe');
    const service = crear([
      fuente([
        { name: "Marvel's Spider-Man: Miles Morales", installDir: join(raiz, 'MM'), source: 'steam' },
      ]),
    ]);
    expect(service.current()).toEqual({}); // aún no ha refrescado
    expect(await service.refresh()).toEqual({
      milesmorales: "Marvel's Spider-Man: Miles Morales",
    });
    expect(service.current().milesmorales).toBe("Marvel's Spider-Man: Miles Morales");
  });

  it('una fuente que peta no tumba a las demás', async () => {
    exe('MM', 'MilesMorales.exe');
    const rota: GameSource = {
      id: 'gog',
      listInstalledGames: () => Promise.reject(new Error('registro ilegible')),
    };
    const service = crear([
      rota,
      fuente([{ name: 'Miles', installDir: join(raiz, 'MM'), source: 'steam' }]),
    ]);
    expect(await service.refresh()).toEqual({ milesmorales: 'Miles' });
  });

  it('con la misma huella reusa el caché en vez de re-escanear', async () => {
    exe('MM', 'MilesMorales.exe');
    const juegos: InstalledGame[] = [
      { name: 'Miles', installDir: join(raiz, 'MM'), source: 'steam' },
    ];
    const listar = vi.fn().mockResolvedValue(juegos);
    const cachePath = join(raiz, 'cache.json');

    const primero = new GameIndexService({
      cachePath,
      sources: [{ id: 'steam', listInstalledGames: listar }],
    });
    await primero.refresh();

    // Un arranque nuevo: el caché está en disco, así que el índice ya está listo sin escanear nada.
    const segundo = new GameIndexService({
      cachePath,
      sources: [{ id: 'steam', listInstalledGames: listar }],
    });
    expect(segundo.current()).toEqual({ milesmorales: 'Miles' });
  });

  it('el mismo juego por dos fuentes se cuenta una vez', async () => {
    // Un juego de Steam publicado por Ubisoft aparece también en el registro de desinstalación.
    exe('ACBF', 'ACBlackFlag.exe');
    const juego = { name: 'AC Black Flag', installDir: join(raiz, 'ACBF') };
    const service = crear([
      fuente([{ ...juego, source: 'steam' }]),
      fuente([{ ...juego, source: 'registry' }], 'registry'),
    ]);
    expect(await service.refresh()).toEqual({ acblackflag: 'AC Black Flag' });
  });

  it('el mismo juego por dos fuentes cuenta una vez aunque una ponga barra final (regresión)', async () => {
    // GOG devuelve la carpeta sin barra y el registro de desinstalación con ella. Contados dos veces
    // con nombres distintos, cada exe parecía de dos juegos (ambiguo) y el juego dejaba de detectarse.
    exe('W3', 'witcher3.exe');
    const service = crear([
      fuente([{ name: 'The Witcher 3', installDir: join(raiz, 'W3'), source: 'gog' }], 'gog'),
      fuente(
        [{ name: 'The Witcher 3: GOTY', installDir: join(raiz, 'W3') + '\\', source: 'registry' }],
        'registry',
      ),
    ]);
    expect(await service.refresh()).toEqual({ witcher3: 'The Witcher 3' });
  });

  it('sin ningún juego instalado conserva el índice anterior en vez de vaciarlo', async () => {
    const service = crear([fuente([])]);
    expect(await service.refresh()).toEqual({});
  });

  it('un caché de antes de las reglas de escaneo actuales se re-indexa aunque los juegos no cambien (regresión)', async () => {
    // Quien actualizaba sin cambios en sus juegos conservaba el índice viejo: la huella solo miraba
    // nombres y carpetas, así que el fix que filtra QtWebEngineProcess no le llegaba nunca.
    exe('W3', 'witcher3.exe');
    exe('W3', 'QtWebEngineProcess.exe');
    const juego = { name: 'The Witcher 3', installDir: join(raiz, 'W3'), source: 'gog' as const };
    const cachePath = join(raiz, 'cache.json');
    // Huella tal cual la escribían las versiones anteriores (sin la versión de las reglas).
    const huellaVieja = [`${juego.name}\u0000${juego.installDir}`].sort().join('\u0001');
    writeFileSync(
      cachePath,
      JSON.stringify({
        huella: huellaVieja,
        index: { witcher3: 'The Witcher 3', qtwebengineprocess: 'The Witcher 3' },
      }),
    );

    const service = new GameIndexService({ cachePath, sources: [fuente([juego], 'gog')] });
    expect(await service.refresh()).toEqual({ witcher3: 'The Witcher 3' });
  });

  it('volver a escanear (force) ignora el caché aunque la huella coincida', async () => {
    exe('MM', 'MilesMorales.exe');
    const service = crear([
      fuente([{ name: 'Miles', installDir: join(raiz, 'MM'), source: 'steam' }]),
    ]);
    await service.refresh();
    exe('MM', 'MilesMoralesDX12.exe'); // cambia el contenido de la carpeta, no la lista de juegos

    expect(await service.refresh()).toEqual({ milesmorales: 'Miles' }); // arranque normal: caché
    expect(await service.refresh({ force: true })).toEqual({
      milesmorales: 'Miles',
      milesmoralesdx12: 'Miles',
    });
  });

  it('un rescan forzado durante un refresco en curso no se pierde', async () => {
    exe('MM', 'MilesMorales.exe');
    const service = crear([
      fuente([{ name: 'Miles', installDir: join(raiz, 'MM'), source: 'steam' }]),
    ]);
    await service.refresh();
    exe('MM', 'MilesMoralesDX12.exe');

    const normal = service.refresh();
    const forzado = service.refresh({ force: true });
    await normal;
    expect(await forzado).toHaveProperty('milesmoralesdx12', 'Miles');
  });
});

describe('GameIndexService · peticiones durante un refresco en curso (regresión D1-BUG-1)', () => {
  /** Promesa que el test suelta a mano: mantiene un refresco «en curso» el tiempo que haga falta. */
  function diferido<T>() {
    let soltar!: (valor: T) => void;
    const promesa = new Promise<T>((resolve) => {
      soltar = resolve;
    });
    return { promesa, soltar };
  }

  const miles = (): InstalledGame[] => [
    { name: 'Miles', installDir: join(raiz, 'MM'), source: 'steam' },
  ];
  const conDX12 = { milesmorales: 'Miles', milesmoralesdx12: 'Miles' };

  /**
   * Servicio con el caché ya escrito (solo `MilesMorales.exe`) y un `MilesMoralesDX12.exe` que
   * aparece después: un refresco normal sale del caché y solo uno forzado lo ve. Devuelve un refresco
   * normal en curso, con la lectura de los launchers colgada hasta `soltar()`.
   */
  async function conRefrescoEnCurso() {
    exe('MM', 'MilesMorales.exe');
    const listar = vi
      .fn<GameSource['listInstalledGames']>()
      .mockImplementation(() => Promise.resolve(miles()));
    const service = new GameIndexService({
      cachePath: join(raiz, 'cache.json'),
      sources: [{ id: 'steam', listInstalledGames: listar }],
    });
    await service.refresh();
    exe('MM', 'MilesMoralesDX12.exe');
    listar.mockClear();
    const colgada = diferido<InstalledGame[]>();
    listar.mockReturnValueOnce(colgada.promesa);
    const enCurso = service.refresh();
    return { service, listar, enCurso, soltar: () => colgada.soltar(miles()) };
  }

  it('una exclusión guardada durante un rescan forzado se aplica al terminar', async () => {
    // `setExcluded` pide un refresco normal; si «Volver a escanear» estaba corriendo, se devolvía ese
    // refresco, que ya había leído la lista vieja: la app recién excluida seguía en el índice (se
    // detectaba como juego y en modo auto grababa) hasta el siguiente refresco o reinicio.
    exe('WE', 'wallpaper64.exe');
    exe('H', 'Hades.exe');
    let excluidos: string[] = [];
    const leida = diferido<void>();
    const service = new GameIndexService({
      cachePath: join(raiz, 'cache.json'),
      sources: [
        fuente([
          { name: 'Wallpaper Engine', installDir: join(raiz, 'WE'), source: 'steam' },
          { name: 'Hades', installDir: join(raiz, 'H'), source: 'steam' },
        ]),
      ],
      exclusions: () => {
        leida.soltar();
        return excluidos;
      },
    });

    const forzado = service.refresh({ force: true });
    await leida.promesa; // el forzado ya leyó la lista (vacía) y está escaneando las carpetas
    excluidos = ['Wallpaper Engine']; // el usuario la marca en «No son juegos»…
    const trasExcluir = service.refresh(); // …y `setExcluded` pide el refresco

    expect(await forzado).toEqual({ wallpaper64: 'Wallpaper Engine', hades: 'Hades' });
    expect(await trasExcluir).toEqual({ hades: 'Hades' });
    expect(service.current()).toEqual({ hades: 'Hades' });
  });

  it('un forzado que llega con un refresco normal en cola lo vuelve forzado (no se degrada)', async () => {
    const { service, listar, enCurso, soltar } = await conRefrescoEnCurso();
    const normal = service.refresh(); // queda en cola detrás del que está en curso
    const forzado = service.refresh({ force: true }); // se suma a esa cola y la vuelve forzada
    soltar();

    expect(await enCurso).toEqual({ milesmorales: 'Miles' }); // el de antes sale del caché
    expect(await forzado).toEqual(conDX12);
    expect(await normal).toEqual(conDX12); // comparte el refresco de la cola
    expect(listar).toHaveBeenCalledTimes(2);
  });

  it('varias peticiones durante un refresco en curso se agrupan en UN solo refresco más', async () => {
    const { service, listar, enCurso, soltar } = await conRefrescoEnCurso();
    const peticiones = [
      service.refresh(),
      service.refresh({ force: true }),
      service.refresh(),
      service.refresh({ force: true }),
    ];
    soltar();
    await enCurso;
    const resultados = await Promise.all(peticiones);

    expect(listar).toHaveBeenCalledTimes(2); // el que estaba en curso + uno solo para las cuatro
    for (const resultado of resultados) expect(resultado).toEqual(conDX12);
  });

  it('una petición que llega mientras corre el refresco de la cola programa otro', async () => {
    const { service, listar, enCurso, soltar } = await conRefrescoEnCurso();
    const segunda = diferido<InstalledGame[]>();
    listar.mockReturnValueOnce(segunda.promesa); // el refresco de la cola también se queda colgado
    const cola = service.refresh();
    soltar();
    await enCurso;
    await vi.waitFor(() => expect(listar).toHaveBeenCalledTimes(2)); // la cola ya está corriendo

    const otra = service.refresh({ force: true });
    segunda.soltar(miles());

    expect(await cola).toEqual({ milesmorales: 'Miles' });
    expect(await otra).toEqual(conDX12);
    expect(listar).toHaveBeenCalledTimes(3);
  });

  it('una petición justo al terminar el refresco en curso se suma a la cola: nunca corren dos a la vez', async () => {
    const { service, listar, enCurso, soltar } = await conRefrescoEnCurso();
    let alTerminar: ReturnType<GameIndexService['refresh']> | undefined;
    // Registrado antes que la cola: corre entre el fin del refresco en curso y el arranque de la cola.
    const visto = enCurso.then(() => {
      alTerminar = service.refresh({ force: true });
    });
    const cola = service.refresh();
    soltar();
    await visto;

    expect(await cola).toEqual(conDX12);
    expect(await alTerminar).toEqual(conDX12);
    expect(listar).toHaveBeenCalledTimes(2);
  });

  it('si el refresco en curso falla, el que se pidió durante él corre igual', async () => {
    exe('MM', 'MilesMorales.exe');
    let lecturas = 0;
    const service = new GameIndexService({
      cachePath: join(raiz, 'cache.json'),
      sources: [fuente(miles())],
      exclusions: () => {
        lecturas += 1;
        if (lecturas === 1) throw new Error('ajustes ilegibles');
        return [];
      },
    });
    const enCurso = service.refresh();
    const despues = service.refresh();

    await expect(enCurso).rejects.toThrow('ajustes ilegibles');
    expect(await despues).toEqual({ milesmorales: 'Miles' });
    expect(await service.refresh()).toEqual({ milesmorales: 'Miles' }); // y el servicio sigue sano
  });
});

describe('GameIndexService · exclusiones («no son juegos»)', () => {
  it('un juego excluido no aporta ejecutables y installed() lo sigue listando', async () => {
    exe('WE', 'wallpaper64.exe');
    exe('H', 'Hades.exe');
    const service = new GameIndexService({
      cachePath: join(raiz, 'cache.json'),
      sources: [
        fuente([
          { name: 'Wallpaper Engine', installDir: join(raiz, 'WE'), source: 'steam', steamAppId: '431960' },
          { name: 'Hades', installDir: join(raiz, 'H'), source: 'steam' },
        ]),
      ],
      exclusions: () => ['wallpaper engine'],
    });
    expect(await service.refresh()).toEqual({ hades: 'Hades' });
    expect(service.installed().map((j) => j.name)).toEqual(['Wallpaper Engine', 'Hades']);
  });

  it('un exe compartido con una app excluida no se vuelve ambiguo', async () => {
    exe('APP', 'common.exe');
    exe('JUEGO', 'common.exe');
    const service = new GameIndexService({
      cachePath: join(raiz, 'cache.json'),
      sources: [
        fuente([
          { name: 'App', installDir: join(raiz, 'APP'), source: 'steam' },
          { name: 'Juego', installDir: join(raiz, 'JUEGO'), source: 'steam' },
        ]),
      ],
      exclusions: () => ['App'],
    });
    expect(await service.refresh()).toEqual({ common: 'Juego' });
  });

  it('cambiar la lista invalida el caché (re-indexa)', async () => {
    exe('WE', 'wallpaper64.exe');
    let excluidos: string[] = [];
    const service = new GameIndexService({
      cachePath: join(raiz, 'cache.json'),
      sources: [fuente([{ name: 'Wallpaper Engine', installDir: join(raiz, 'WE'), source: 'steam' }])],
      exclusions: () => excluidos,
    });
    expect(await service.refresh()).toEqual({ wallpaper64: 'Wallpaper Engine' });
    excluidos = ['Wallpaper Engine'];
    expect(await service.refresh()).toEqual({});
  });

  it('la lista recibe lo que devolvieron los launchers (para sincronizar la curada)', async () => {
    const exclusions = vi.fn().mockReturnValue([]);
    const juego = { name: 'SteamVR', installDir: join(raiz, 'VR'), source: 'steam' as const, steamAppId: '250820' };
    const service = new GameIndexService({
      cachePath: join(raiz, 'cache.json'),
      sources: [fuente([juego])],
      exclusions,
    });
    await service.refresh();
    expect(exclusions).toHaveBeenCalledWith([juego]);
  });
});

describe('huellaDe', () => {
  it('no depende del orden de las fuentes', () => {
    const a: InstalledGame = { name: 'A', installDir: 'D:\\A', source: 'steam' };
    const b: InstalledGame = { name: 'B', installDir: 'D:\\B', source: 'epic' };
    expect(huellaDe([a, b])).toBe(huellaDe([b, a]));
  });

  it('cambia al instalarse un juego nuevo (dispara el re-escaneo)', () => {
    const a: InstalledGame = { name: 'A', installDir: 'D:\\A', source: 'steam' };
    const b: InstalledGame = { name: 'B', installDir: 'D:\\B', source: 'epic' };
    expect(huellaDe([a])).not.toBe(huellaDe([a, b]));
  });
});
