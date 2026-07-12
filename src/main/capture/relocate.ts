import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { ClipKind } from '@shared/clip-naming';
import { clipFileName, clipFolderSegments } from '@shared/clip-naming';

/**
 * Ruta destino de un archivo guardado: `<outputDir>/<Juego|Desktop>/<Nombre> <marca>.<ext>`
 * (las capturas van a la subcarpeta `Capturas/` del juego).
 */
export function targetPathFor(opts: {
  outputDir: string;
  gameExecutable: string | null;
  date: Date;
  kind: ClipKind;
  extension: string;
}): string {
  const carpeta = join(opts.outputDir, ...clipFolderSegments(opts.gameExecutable, opts.kind));
  return join(
    carpeta,
    clipFileName({
      gameExecutable: opts.gameExecutable,
      date: opts.date,
      kind: opts.kind,
      extension: opts.extension,
    }),
  );
}

/** Desambigua con ` (2)`, ` (3)`… si el destino ya está ocupado. */
export function uniquePath(target: string, exists: (p: string) => boolean = existsSync): string {
  if (!exists(target)) return target;
  const ext = extname(target);
  const base = target.slice(0, target.length - ext.length);
  for (let i = 2; i < 1000; i++) {
    const candidato = `${base} (${i})${ext}`;
    if (!exists(candidato)) return candidato;
  }
  return target; // 998 colisiones en la misma centésima: mejor pisar que colgarse
}

/**
 * Mueve el archivo recién guardado a su carpeta definitiva (`rename`: mismo volumen → atómico e
 * instantáneo). **Best-effort**: si falla (archivo bloqueado, permisos, otro volumen), devuelve la
 * ruta original — el clip nunca se pierde por no poder renombrarlo.
 */
export function relocateSavedFile(file: string, target: string): string {
  if (file === target) return file;
  try {
    const destino = uniquePath(target);
    mkdirSync(join(destino, '..'), { recursive: true });
    renameSync(file, destino);
    return destino;
  } catch {
    return file;
  }
}
