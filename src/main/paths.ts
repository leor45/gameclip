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
