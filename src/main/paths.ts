import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/**
 * Traduce una ruta que cae dentro de `app.asar` a su gemela en `app.asar.unpacked`.
 *
 * Por qué hace falta: `require.resolve()` y `__dirname` siguen devolviendo rutas
 * `…/app.asar/…` aunque el archivo esté en `asarUnpack` — el asar es transparente para el `fs` de
 * Electron, pero NO para nada que viva fuera de él. Y dos cosas del proyecto son exactamente eso:
 * libobs lanza `obs64.exe` desde el working directory que le pasamos, y ffmpeg es un ejecutable que
 * spawneamos. Un `.exe` no se puede ejecutar desde dentro de un archivo `.asar`, así que esas dos
 * rutas —y solo esas: los `.node` sí los resuelve Electron— se reescriben a la copia desempaquetada.
 *
 * En desarrollo no hay asar y la ruta pasa intacta.
 */
export function unpackedPath(path: string): string {
  return path.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');
}

/**
 * Ruta del `ffmpeg.exe` **que ya trae osn**, no el de `ffmpeg-static`.
 *
 * osn incluye su propio ffmpeg (302 KB: usa las DLLs de FFmpeg que ya viajan con libobs) y tiene todo
 * lo que la app necesita — `libx264`, `gif`, `palettegen`, `paletteuse`, `amix`. `ffmpeg-static`
 * metía 79 MB para duplicarlo.
 *
 * Se resuelve igual que el directorio de osn en `obs.ts`: `require.resolve` y, en el paquete, la
 * copia desempaquetada — ffmpeg es un ejecutable que se spawnea y no puede vivir dentro del asar.
 */
export function ffmpegPath(): string {
  const require = createRequire(__filename);
  const osnDir = dirname(require.resolve('@streamlabs/obs-studio-node/package.json'));
  return unpackedPath(join(osnDir, 'ffmpeg.exe'));
}
