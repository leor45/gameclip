import { existsSync } from 'node:fs';
import { powerShellJson } from '../powershell';
import type { GameSource, InstalledGame } from '../types';

/**
 * Ubisoft Connect · EA App · Battle.net, de una sola pasada. Ninguno de los tres expone un manifiesto
 * decente (el `product.db` de Battle.net es protobuf), pero **los tres registran sus juegos en el
 * registro de desinstalación de Windows** con `DisplayName` + `InstallLocation`. Una fuente genérica
 * sale más barata y más robusta que tres parsers a medida.
 *
 * Sin verificar contra datos reales: en la máquina del owner los tres launchers están instalados pero
 * **sin un solo juego**. La lógica se prueba con fixtures; ante cualquier sorpresa devuelve `[]`.
 */

const SCRIPT = `
  @(
    'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
  ) | ForEach-Object {
    Get-ChildItem $_ -ErrorAction SilentlyContinue | ForEach-Object {
      $p = Get-ItemProperty -Path $_.PSPath -ErrorAction SilentlyContinue
      if ($p.DisplayName -and $p.InstallLocation) {
        [PSCustomObject]@{
          name      = $p.DisplayName
          path      = $p.InstallLocation
          publisher = $p.Publisher
        }
      }
    }
  }
`;

/** Editoras cuyos juegos llegan por Ubisoft/EA/Battle.net. Los suyos van a otras carpetas cada uno. */
const EDITORAS_DE_JUEGOS =
  /ubisoft|electronic arts|\bea\b|blizzard|activision|gog\.com|rockstar|bethesda|cd projekt/i;

/** Carpetas donde estos launchers instalan: aquí el editor puede venir vacío y aun así ser un juego. */
const RAICES_DE_JUEGOS = /\\(ubisoft game launcher\\games|ea games|origin games|gog galaxy\\games)\\/i;

/** Los propios launchers, los redistribuibles y demás software que NO es un juego. */
const NO_ES_JUEGO =
  /^(battle\.net|ubisoft connect|gog galaxy|epic games launcher|steam|rockstar games launcher|ea app|origin|uplay)$|redistributable|directx|\.net framework|visual c\+\+|driver|runtime/i;

interface EntradaRegistro {
  name?: unknown;
  path?: unknown;
  publisher?: unknown;
}

/**
 * Se queda con lo que parece un juego: instalado bajo la carpeta de juegos de un launcher, o
 * publicado por una editora de videojuegos. Los launchers en sí y los redistribuibles se descartan
 * por nombre — si no, "Battle.net" acabaría en el índice como si fuera un juego.
 */
export function parseUninstallEntries(
  entradas: EntradaRegistro[],
  existe: (p: string) => boolean = existsSync,
): InstalledGame[] {
  const out: InstalledGame[] = [];
  const vistos = new Set<string>();
  for (const e of entradas) {
    const name = typeof e.name === 'string' ? e.name.trim() : '';
    const installDir = typeof e.path === 'string' ? e.path.trim() : '';
    const publisher = typeof e.publisher === 'string' ? e.publisher : '';
    if (!name || !installDir) continue;
    if (NO_ES_JUEGO.test(name)) continue;

    const esJuego = RAICES_DE_JUEGOS.test(installDir) || EDITORAS_DE_JUEGOS.test(publisher);
    if (!esJuego || !existe(installDir)) continue;

    const clave = name.toLowerCase();
    if (vistos.has(clave)) continue; // la misma entrada suele estar en las dos vistas del registro
    vistos.add(clave);
    out.push({ name, installDir, source: 'registry' });
  }
  return out;
}

export function createUninstallRegistrySource(run = powerShellJson): GameSource {
  return {
    id: 'registry',
    async listInstalledGames(): Promise<InstalledGame[]> {
      try {
        return parseUninstallEntries(await run<EntradaRegistro>(SCRIPT));
      } catch {
        return [];
      }
    },
  };
}

export const uninstallRegistrySource = createUninstallRegistrySource();
