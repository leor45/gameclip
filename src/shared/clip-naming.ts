// Nomenclatura de los archivos que guarda la app (clips y capturas). Puro: lo usan la captura,
// las capturas de pantalla y la migración del layout viejo.
//
//   <carpeta de clips>/Terraria/Terraria 2026.07.02 - 10.02.01.01.mp4
//   <carpeta de clips>/Terraria/Capturas/Terraria Screenshot 2025.12.22 - 20.47.50.78.png
//   <carpeta de clips>/Desktop/Desktop 2026.07.02 - 10.02.01.01.mp4

/** Carpeta (y base del nombre) de todo lo que no pertenece a un juego. */
export const DESKTOP_FOLDER = 'Desktop';

/** Subcarpeta de las capturas de pantalla, dentro de la del juego. */
export const SCREENSHOTS_FOLDER = 'Capturas';

export type ClipKind = 'video' | 'screenshot';

// Caracteres que Windows no admite en nombres de archivo o carpeta. Los espacios se conservan:
// hay ejecutables como `Among Us.exe`.
const INVALID_CHARS = /[<>:"/\\|?*]/g;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/**
 * Base del nombre a partir del ejecutable del juego: `Terraria.exe` → `Terraria`. Sin juego (o con
 * un nombre que queda vacío al limpiarlo) → `Desktop`. La base es también el nombre de la carpeta.
 */
export function clipBaseName(gameExecutable: string | null | undefined): string {
  if (!gameExecutable) return DESKTOP_FOLDER;
  const sinExe = gameExecutable.trim().replace(/\.exe$/i, '');
  const limpio = sinExe.replace(INVALID_CHARS, '').trim();
  return limpio || DESKTOP_FOLDER;
}

/**
 * Marca de tiempo `AAAA.MM.DD - HH.MM.SS.CC` (centésimas al final). Los ':' no valen en rutas de
 * Windows, de ahí los puntos.
 */
export function clipTimestamp(date: Date): string {
  const fecha = `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
  const hora = `${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}`;
  const centesimas = pad(Math.floor(date.getMilliseconds() / 10));
  return `${fecha} - ${hora}.${centesimas}`;
}

/**
 * Nombre completo del archivo. Las capturas llevan `Screenshot` entre la base y la marca de tiempo:
 * `Terraria Screenshot 2025.12.22 - 20.47.50.78.png`.
 */
export function clipFileName(opts: {
  gameExecutable: string | null;
  date: Date;
  kind: ClipKind;
  extension: string;
}): string {
  const base = clipBaseName(opts.gameExecutable);
  const marca = clipTimestamp(opts.date);
  const cuerpo = opts.kind === 'screenshot' ? `${base} Screenshot ${marca}` : `${base} ${marca}`;
  return `${cuerpo}.${opts.extension.replace(/^\./, '')}`;
}

/** Segmentos de carpeta (relativos a la carpeta de clips) donde va el archivo. */
export function clipFolderSegments(gameExecutable: string | null, kind: ClipKind): string[] {
  const base = clipBaseName(gameExecutable);
  return kind === 'screenshot' ? [base, SCREENSHOTS_FOLDER] : [base];
}
