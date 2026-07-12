import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { GameSource, InstalledGame } from '../types';

/**
 * Xbox / Game Pass. Instala en `<unidad>:\XboxGames\<Juego>\Content\`, con un `MicrosoftGame.config`
 * (XML) cuyo `ShellVisuals DefaultDisplayName` trae el nombre bonito. Si no se puede leer, la carpeta
 * ya suele ser el nombre del juego.
 *
 * Sin verificar contra datos reales: en la máquina del owner `C:\XboxGames` solo tiene `GameSave`.
 */

/** No es un juego: es donde Xbox guarda las partidas. */
const NO_JUEGOS = /^gamesave$/i;

function raicesXbox(): string[] {
  const out: string[] = [];
  for (let c = 'C'.charCodeAt(0); c <= 'Z'.charCodeAt(0); c++) {
    const raiz = `${String.fromCharCode(c)}:\\XboxGames`;
    if (existsSync(raiz)) out.push(raiz);
  }
  return out;
}

/** `<ShellVisuals … DefaultDisplayName="Forza Horizon 5" …/>` */
export function displayNameFromConfig(xml: string): string | null {
  return /DefaultDisplayName\s*=\s*"([^"]+)"/i.exec(xml)?.[1]?.trim() || null;
}

export const xboxSource: GameSource = {
  id: 'xbox',
  listInstalledGames(): Promise<InstalledGame[]> {
    const out: InstalledGame[] = [];
    for (const raiz of raicesXbox()) {
      let carpetas: string[];
      try {
        carpetas = readdirSync(raiz, { withFileTypes: true })
          .filter((e) => e.isDirectory() && !NO_JUEGOS.test(e.name))
          .map((e) => e.name);
      } catch {
        continue;
      }
      for (const carpeta of carpetas) {
        const installDir = join(raiz, carpeta, 'Content');
        if (!existsSync(installDir)) continue;
        let name = carpeta;
        try {
          name =
            displayNameFromConfig(readFileSync(join(installDir, 'MicrosoftGame.config'), 'utf8')) ??
            carpeta;
        } catch {
          // sin config legible: la carpeta ya suele ser el nombre del juego
        }
        out.push({ name, installDir, source: 'xbox' });
      }
    }
    return Promise.resolve(out);
  },
};
