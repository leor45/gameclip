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

  it('sin ningún juego instalado conserva el índice anterior en vez de vaciarlo', async () => {
    const service = crear([fuente([])]);
    expect(await service.refresh()).toEqual({});
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
