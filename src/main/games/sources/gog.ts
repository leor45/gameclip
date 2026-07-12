import { existsSync } from 'node:fs';
import { powerShellJson } from '../powershell';
import type { GameSource, InstalledGame } from '../types';

/**
 * GOG Galaxy. Es el único de los launchers "sin manifiesto" que deja una clave limpia en el registro:
 * `HKLM\SOFTWARE\WOW6432Node\GOG.com\Games\<id>` con `gameName` y `path`.
 *
 * Sin verificar contra datos reales: en la máquina del owner GOG está instalado pero **sin un solo
 * juego** (la clave `GOG.com\Games` ni existe). La lógica se prueba con fixtures; si el formato no
 * fuera el esperado, la fuente devuelve `[]` y el resto del índice sigue igual.
 */

const SCRIPT = `
  Get-ChildItem 'HKLM:\\SOFTWARE\\WOW6432Node\\GOG.com\\Games' -ErrorAction SilentlyContinue |
    ForEach-Object {
      $p = Get-ItemProperty -Path $_.PSPath
      [PSCustomObject]@{ name = $p.gameName; path = $p.path }
    }
`;

interface EntradaGog {
  name?: unknown;
  path?: unknown;
}

export function parseGogEntries(
  entradas: EntradaGog[],
  existe: (p: string) => boolean = existsSync,
): InstalledGame[] {
  const out: InstalledGame[] = [];
  for (const e of entradas) {
    const name = typeof e.name === 'string' ? e.name.trim() : '';
    const installDir = typeof e.path === 'string' ? e.path.trim() : '';
    if (!name || !installDir || !existe(installDir)) continue;
    out.push({ name, installDir, source: 'gog' });
  }
  return out;
}

export function createGogSource(run = powerShellJson): GameSource {
  return {
    id: 'gog',
    async listInstalledGames(): Promise<InstalledGame[]> {
      try {
        return parseGogEntries(await run<EntradaGog>(SCRIPT));
      } catch {
        return [];
      }
    },
  };
}

export const gogSource = createGogSource();
