import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGogSource, parseGogEntries } from '../sources/gog';
import { bibliotecasDe, createSteamSource, leerPar } from '../sources/steam';
import {
  createUninstallRegistrySource,
  parseUninstallEntries,
} from '../sources/uninstall-registry';
import { displayNameFromConfig } from '../sources/xbox';

let raiz: string;

/** Los tests montan su propia "instalación" de Steam: nadie consulta el registro de la máquina. */
const sinRegistro = () => Promise.resolve([]);

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'gameclip-games-'));
});
afterEach(() => {
  rmSync(raiz, { recursive: true, force: true });
});

/** Monta una biblioteca de Steam de mentira en disco, con sus manifiestos y carpetas. */
function montarSteam(juegos: { appid: string; name: string; installdir: string }[]): string {
  const steamapps = join(raiz, 'steamapps');
  mkdirSync(join(steamapps, 'common'), { recursive: true });
  for (const juego of juegos) {
    writeFileSync(
      join(steamapps, `appmanifest_${juego.appid}.acf`),
      `"AppState"\n{\n\t"appid"\t\t"${juego.appid}"\n\t"name"\t\t"${juego.name}"\n\t"installdir"\t\t"${juego.installdir}"\n}\n`,
      'utf8',
    );
    mkdirSync(join(steamapps, 'common', juego.installdir), { recursive: true });
  }
  return raiz;
}

describe('Steam', () => {
  it('lee el nombre del catálogo del appmanifest, incluidos los símbolos de marca (UTF-8)', () => {
    const acf = '"AppState"\n{\n\t"name"\t\t"DARK SOULS™: REMASTERED"\n\t"installdir"\t\t"DS"\n}';
    expect(leerPar(acf, 'name')).toBe('DARK SOULS™: REMASTERED');
    expect(leerPar(acf, 'installdir')).toBe('DS');
    expect(leerPar(acf, 'noexiste')).toBeNull();
  });

  it('libraryfolders.vdf da todas las bibliotecas, no solo la de la instalación', () => {
    mkdirSync(join(raiz, 'steamapps'), { recursive: true });
    writeFileSync(
      join(raiz, 'steamapps', 'libraryfolders.vdf'),
      '"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path"\t\t"C:\\\\Program Files (x86)\\\\Steam"\n\t}\n\t"1"\n\t{\n\t\t"path"\t\t"F:\\\\SteamLibrary"\n\t}\n}',
      'utf8',
    );
    expect(bibliotecasDe(raiz)).toEqual([
      raiz,
      'C:\\Program Files (x86)\\Steam',
      'F:\\SteamLibrary',
    ]);
  });

  it('sin libraryfolders.vdf queda la biblioteca por defecto (no revienta)', () => {
    expect(bibliotecasDe(raiz)).toEqual([raiz]);
  });

  it('un juego catalogado pero no descargado (sin carpeta) no entra en el índice', async () => {
    const steamapps = join(raiz, 'steamapps');
    mkdirSync(join(steamapps, 'common'), { recursive: true });
    writeFileSync(
      join(steamapps, 'appmanifest_1.acf'),
      '"AppState"\n{\n\t"name"\t\t"Fantasma"\n\t"installdir"\t\t"NoDescargado"\n}',
      'utf8',
    );
    const source = createSteamSource(sinRegistro, [raiz]);
    expect(await source.listInstalledGames()).toEqual([]);
  });

  it('devuelve los juegos instalados con su carpeta', async () => {
    montarSteam([{ appid: '1817190', name: "Marvel's Spider-Man: Miles Morales", installdir: 'MM' }]);
    const source = createSteamSource(sinRegistro, [raiz]);
    expect(await source.listInstalledGames()).toEqual([
      {
        name: "Marvel's Spider-Man: Miles Morales",
        installDir: join(raiz, 'steamapps', 'common', 'MM'),
        source: 'steam',
      },
    ]);
  });
});

describe('GOG', () => {
  it('mapea gameName + path del registro', () => {
    const entradas = [{ name: 'Cyberpunk 2077', path: raiz }];
    expect(parseGogEntries(entradas, () => true)).toEqual([
      { name: 'Cyberpunk 2077', installDir: raiz, source: 'gog' },
    ]);
  });

  it('descarta entradas incompletas o cuya carpeta ya no existe', () => {
    const entradas = [
      { name: '', path: 'D:\\X' },
      { name: 'Sin ruta', path: '' },
      { name: 'Desinstalado', path: 'D:\\Ya no está' },
    ];
    expect(parseGogEntries(entradas, () => false)).toEqual([]);
  });

  it('si la clave del registro no existe, la fuente devuelve [] sin tumbar nada', async () => {
    const source = createGogSource(() => Promise.reject(new Error('clave inexistente')));
    expect(await source.listInstalledGames()).toEqual([]);
  });
});

describe('registro de desinstalación (Ubisoft · EA · Battle.net)', () => {
  const existe = () => true;

  it('acepta lo que publica una editora de videojuegos', () => {
    const entradas = [
      { name: 'Diablo IV', path: 'C:\\Program Files (x86)\\Diablo IV', publisher: 'Blizzard Entertainment' },
    ];
    expect(parseUninstallEntries(entradas, existe)).toEqual([
      { name: 'Diablo IV', installDir: 'C:\\Program Files (x86)\\Diablo IV', source: 'registry' },
    ]);
  });

  it('acepta lo instalado bajo la carpeta de juegos de un launcher, aunque no diga editora', () => {
    const entradas = [
      {
        name: 'Assassin\'s Creed Valhalla',
        path: 'C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\games\\ACV\\',
        publisher: '',
      },
    ];
    expect(parseUninstallEntries(entradas, existe)).toHaveLength(1);
  });

  it('descarta los propios launchers y los redistribuibles', () => {
    // Sin esto, "Battle.net" entraría en el índice como si fuera un juego.
    const entradas = [
      { name: 'Battle.net', path: 'C:\\Program Files (x86)\\Battle.net', publisher: 'Blizzard Entertainment' },
      { name: 'Ubisoft Connect', path: 'C:\\Ubisoft', publisher: 'Ubisoft' },
      { name: 'Microsoft Visual C++ 2015 Redistributable', path: 'C:\\vc', publisher: 'Microsoft' },
    ];
    expect(parseUninstallEntries(entradas, existe)).toEqual([]);
  });

  it('descarta el software que no es de una editora de juegos', () => {
    const entradas = [{ name: 'Notepad++', path: 'C:\\npp', publisher: 'Don Ho' }];
    expect(parseUninstallEntries(entradas, existe)).toEqual([]);
  });

  it('deduplica: la misma entrada suele estar en las dos vistas del registro', () => {
    const entradas = [
      { name: 'Diablo IV', path: 'C:\\D4', publisher: 'Blizzard Entertainment' },
      { name: 'Diablo IV', path: 'C:\\D4', publisher: 'Blizzard Entertainment' },
    ];
    expect(parseUninstallEntries(entradas, existe)).toHaveLength(1);
  });

  it('si PowerShell falla, la fuente devuelve [] sin tumbar el índice', async () => {
    const source = createUninstallRegistrySource(() => Promise.reject(new Error('boom')));
    expect(await source.listInstalledGames()).toEqual([]);
  });
});

describe('Xbox', () => {
  it('saca el nombre bonito del MicrosoftGame.config', () => {
    const xml = '<Game><ShellVisuals DefaultDisplayName="Forza Horizon 5" Square150x150Logo="x.png"/></Game>';
    expect(displayNameFromConfig(xml)).toBe('Forza Horizon 5');
  });

  it('sin DefaultDisplayName devuelve null (se cae al nombre de la carpeta)', () => {
    expect(displayNameFromConfig('<Game/>')).toBeNull();
  });
});
