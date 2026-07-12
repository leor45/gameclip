import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SCREENSHOTS_FOLDER } from '@shared/clip-naming';
import { relocateSavedFile, targetPathFor } from '../capture/relocate';
import { canonicalClipPath } from './clip-path';
import type { ClipsRepository } from './clips-repository';

export interface MigrateLayoutResult {
  /** Clips movidos a la carpeta de su juego (o a Desktop). */
  movedClips: number;
  /** Capturas movidas desde el viejo `Capturas/` de la raíz. */
  movedScreenshots: number;
}

/**
 * Lleva al layout de la Fase 10 lo que quedó del anterior: los clips sueltos en la RAÍZ de la
 * carpeta pasan a `<salida>/<Juego|Desktop>/<Nombre> <marca>.mp4`, y las capturas del viejo
 * `<salida>/Capturas/` a `<salida>/Desktop/Capturas/`.
 *
 * El juego sale del catálogo (`clip.game`) y la marca de tiempo de `createdAt`: el nombre debe decir
 * cuándo se grabó el clip, no cuándo se migró. Clip por clip y best-effort: el que no se pueda mover
 * (archivo abierto, permisos) se queda donde está, con su fila intacta.
 */
export function migrateClipLayout(
  repo: ClipsRepository,
  outputDir: string,
): MigrateLayoutResult {
  const raiz = canonicalClipPath(outputDir);
  let movedClips = 0;
  let movedScreenshots = 0;

  for (const clip of repo.list()) {
    // Solo lo que está suelto en la raíz: lo que ya vive en una subcarpeta se respeta.
    if (canonicalClipPath(dirname(clip.filePath)) !== raiz) continue;
    if (!existsSync(clip.filePath)) continue;

    const destino = targetPathFor({
      outputDir: raiz,
      gameName: clip.game,
      date: new Date(clip.createdAt),
      kind: 'video',
      extension: extensionOf(clip.filePath),
    });
    const final = relocateSavedFile(clip.filePath, destino);
    if (final === clip.filePath) continue; // no se pudo mover: se queda como está

    repo.setPath(clip.id, final);
    movedClips++;
  }

  movedScreenshots = migrateScreenshots(raiz);
  return { movedClips, movedScreenshots };
}

/** Las capturas del viejo `<salida>/Capturas/` no están en el catálogo: solo se mueven. */
function migrateScreenshots(outputDir: string): number {
  const viejo = join(outputDir, SCREENSHOTS_FOLDER);
  if (!existsSync(viejo)) return 0;

  let movidas = 0;
  for (const name of readdirSync(viejo)) {
    if (!name.toLowerCase().endsWith('.png')) continue;
    const file = join(viejo, name);
    const destino = targetPathFor({
      outputDir,
      gameName: null, // el layout viejo no guardaba a qué juego pertenecía la captura
      date: statSync(file).mtime,
      kind: 'screenshot',
      extension: 'png',
    });
    if (relocateSavedFile(file, destino) !== file) movidas++;
  }
  return movidas;
}

function extensionOf(filePath: string): string {
  const punto = filePath.lastIndexOf('.');
  return punto === -1 ? 'mp4' : filePath.slice(punto + 1);
}
