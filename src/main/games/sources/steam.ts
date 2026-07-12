import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { powerShellJson } from '../powershell';
import type { GameSource, InstalledGame } from '../types';

/**
 * Steam. `libraryfolders.vdf` lista TODAS las bibliotecas (en la máquina del owner hay cinco,
 * repartidas por C/D/E/F/G), y cada una tiene un `appmanifest_<appid>.acf` por juego con su nombre
 * de catálogo y su carpeta:
 *
 *   "name"       "Marvel's Spider-Man: Miles Morales"
 *   "installdir" "Marvel's Spider-Man Miles Morales"
 *
 * Los ficheros son UTF-8 (traen `™`, `®`): leerlos en ANSI produce mojibake tipo `â„¢`.
 */

const RAICES_HABITUALES = ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam'];

/** Steam instalado fuera de Program Files: su ruta está en el registro. */
const SCRIPT_RAIZ = `
  (Get-ItemProperty -Path 'HKCU:\\SOFTWARE\\Valve\\Steam' -ErrorAction SilentlyContinue).SteamPath
`;

/** VDF/ACF es un árbol de pares `"clave" "valor"`; para lo que necesitamos basta con leer los pares. */
export function leerPar(texto: string, clave: string): string | null {
  return new RegExp(`"${clave}"\\s+"([^"]*)"`, 'i').exec(texto)?.[1] ?? null;
}

/** Rutas de biblioteca: la de la instalación de Steam, más las que liste `libraryfolders.vdf`. */
export function bibliotecasDe(steamRoot: string, leer = readFileSync): string[] {
  const out = [steamRoot];
  try {
    const vdf = String(leer(join(steamRoot, 'steamapps', 'libraryfolders.vdf'), 'utf8'));
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/gi)) {
      out.push(m[1].replace(/\\\\/g, '\\')); // el VDF escapa las barras
    }
  } catch {
    // sin libraryfolders (Steam recién instalado): queda la biblioteca por defecto
  }
  return [...new Set(out)];
}

function juegosDeBiblioteca(libraryPath: string): InstalledGame[] {
  const steamapps = join(libraryPath, 'steamapps');
  let manifiestos: string[];
  try {
    manifiestos = readdirSync(steamapps).filter(
      (f) => f.startsWith('appmanifest_') && f.endsWith('.acf'),
    );
  } catch {
    return []; // biblioteca en una unidad desconectada, p. ej.
  }

  const out: InstalledGame[] = [];
  for (const manifiesto of manifiestos) {
    try {
      const acf = readFileSync(join(steamapps, manifiesto), 'utf8');
      const name = leerPar(acf, 'name');
      const installdir = leerPar(acf, 'installdir');
      if (!name || !installdir) continue;
      const installDir = join(steamapps, 'common', installdir);
      if (!existsSync(installDir)) continue; // catalogado pero no descargado
      out.push({ name, installDir, source: 'steam' });
    } catch {
      // manifiesto corrupto: se salta, el resto sigue
    }
  }
  return out;
}

async function raizSteam(run: typeof powerShellJson, roots: string[]): Promise<string | null> {
  const habitual = roots.find((r) => existsSync(r));
  if (habitual) return habitual;
  try {
    const [ruta] = await run<string>(SCRIPT_RAIZ);
    return typeof ruta === 'string' && existsSync(ruta) ? ruta : null;
  } catch {
    return null;
  }
}

export function createSteamSource(
  run = powerShellJson,
  roots: string[] = RAICES_HABITUALES,
): GameSource {
  return {
    id: 'steam',
    async listInstalledGames(): Promise<InstalledGame[]> {
      try {
        const root = await raizSteam(run, roots);
        if (!root) return [];
        return bibliotecasDe(root).flatMap(juegosDeBiblioteca);
      } catch {
        return [];
      }
    },
  };
}

export const steamSource = createSteamSource();
