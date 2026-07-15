import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { GameSource, InstalledGame } from '../types';

/**
 * Riot Client. Todos sus juegos (Valorant, LoL, Legends of Runeterra, 2XKO…) viven en un almacén
 * unificado: `%ProgramData%\Riot Games\Metadata\<producto>\<producto>.product_settings.yaml`, con dos
 * claves de primer nivel — `product_install_full_path` (carpeta) y `shortcut_name` (nombre, `"2XKO.lnk"`).
 * La **presencia** de ese fichero es la señal de "instalado": un producto no instalado deja la carpeta
 * de metadatos pero sin él.
 *
 * Su ejecutable no delata el juego (2XKO arranca `Lion.exe`), así que solo se guarda la carpeta y los
 * ejecutables los saca el escaneo. Solo interesan esas dos claves: se leen con un regex por línea, sin
 * dependencia de YAML (igual que Xbox saca `DefaultDisplayName` de su XML).
 */

function metadataDirPorDefecto(): string {
  const programData = process.env.PROGRAMDATA ?? 'C:\\ProgramData';
  return join(programData, 'Riot Games', 'Metadata');
}

/**
 * Saca ruta de instalación + nombre del `product_settings.yaml`. El regex se ancla a inicio de línea
 * (`^…$`) para no confundir las claves de primer nivel con las anidadas (`settings.create_shortcut`…).
 * Sin `product_install_full_path` no hay juego → `null`. Sin `shortcut_name`, el nombre se cae a la
 * carpeta del juego: Riot instala en `<Juego>\<Patchline>` (`2XKO\Live`), así que es el penúltimo segmento.
 */
export function parseRiotProductSettings(
  yaml: string,
): { name: string; installDir: string } | null {
  const installDir = /^product_install_full_path:\s*"?([^"\r\n]+?)"?\s*$/m.exec(yaml)?.[1]?.trim();
  if (!installDir) return null;

  const shortcut = /^shortcut_name:\s*"?([^"\r\n]+?)"?\s*$/m.exec(yaml)?.[1]?.trim();
  const segmentos = installDir.replace(/[\\/]+$/, '').split(/[\\/]/);
  const name = shortcut
    ? shortcut.replace(/\.lnk$/i, '').trim()
    : (segmentos[segmentos.length - 2] ?? '').trim();
  if (!name) return null;

  return { name, installDir };
}

export function createRiotSource(
  metadataDir: string = metadataDirPorDefecto(),
  existe: (p: string) => boolean = existsSync,
): GameSource {
  return {
    id: 'riot',
    listInstalledGames(): Promise<InstalledGame[]> {
      let subdirs;
      try {
        subdirs = readdirSync(metadataDir, { withFileTypes: true });
      } catch {
        return Promise.resolve([]); // Riot no instalado
      }

      const out: InstalledGame[] = [];
      for (const dirent of subdirs) {
        if (!dirent.isDirectory() || dirent.name === 'Riot Client') continue; // el launcher no es un juego
        const dir = join(metadataDir, dirent.name);
        try {
          const file = readdirSync(dir).find((f) => f.endsWith('.product_settings.yaml'));
          if (!file) continue; // producto no instalado: carpeta de metadatos sin ajustes
          const parsed = parseRiotProductSettings(readFileSync(join(dir, file), 'utf8'));
          if (!parsed || !existe(parsed.installDir)) continue;
          out.push({ name: parsed.name, installDir: parsed.installDir, source: 'riot' });
        } catch {
          // producto ilegible: se salta, el resto del índice sigue
        }
      }
      return Promise.resolve(out);
    },
  };
}

export const riotSource = createRiotSource();
