import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { GameSource, InstalledGame } from '../types';

/**
 * Epic Games. Un JSON por juego en `%ProgramData%\Epic\EpicGamesLauncher\Data\Manifests\*.item`,
 * con `DisplayName` e `InstallLocation`. Su `LaunchExecutable` **no** sirve para detectar: el de
 * Fortnite es un bootstrapper, y el proceso que corre de verdad es otro. Por eso solo se guarda la
 * carpeta, y los ejecutables los saca el escaneo.
 */

function manifestsDir(): string {
  const programData = process.env.PROGRAMDATA ?? 'C:\\ProgramData';
  return join(programData, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
}

export const epicSource: GameSource = {
  id: 'epic',
  listInstalledGames(): Promise<InstalledGame[]> {
    const dir = manifestsDir();
    let items: string[];
    try {
      items = readdirSync(dir).filter((f) => f.endsWith('.item'));
    } catch {
      return Promise.resolve([]); // Epic no instalado
    }

    const out: InstalledGame[] = [];
    for (const item of items) {
      try {
        const json = JSON.parse(readFileSync(join(dir, item), 'utf8')) as {
          DisplayName?: unknown;
          InstallLocation?: unknown;
        };
        const name = typeof json.DisplayName === 'string' ? json.DisplayName.trim() : '';
        const installDir =
          typeof json.InstallLocation === 'string' ? json.InstallLocation.trim() : '';
        if (!name || !installDir || !existsSync(installDir)) continue;
        out.push({ name, installDir, source: 'epic' });
      } catch {
        // manifiesto corrupto: se salta
      }
    }
    return Promise.resolve(out);
  },
};
