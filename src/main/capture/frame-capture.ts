import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { LibraryManager } from '../library/manager';
import { targetPathFor, uniquePath } from './relocate';

/**
 * Guarda un fotograma (PNG en base64, ya con el reencuadre aplicado) del clip como **captura** en la
 * carpeta del juego (`<outputDir>/<Juego|Desktop>/Capturas/…`, misma nomenclatura que la hotkey) y lo
 * da de alta en la biblioteca. Best-effort: devuelve la ruta, o `null` si el PNG venía vacío.
 */
export async function saveClipFrame(opts: {
  outputDir: string;
  gameName: string | null;
  pngBase64: string;
  library: LibraryManager | null;
}): Promise<string | null> {
  const data = opts.pngBase64.replace(/^data:image\/png;base64,/, '');
  const buffer = Buffer.from(data, 'base64');
  if (buffer.length === 0) return null;

  const target = uniquePath(
    targetPathFor({
      outputDir: opts.outputDir,
      gameName: opts.gameName,
      date: new Date(),
      kind: 'screenshot',
      extension: 'png',
    }),
  );
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, buffer);

  try {
    await opts.library?.registerSavedClip(target, 'scan', opts.gameName);
  } catch (err) {
    console.error('[frame-capture] no se pudo catalogar el fotograma:', err);
  }
  return target;
}
