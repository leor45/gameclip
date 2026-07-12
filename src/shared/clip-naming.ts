import type { GameNameContext } from './games';
import { KNOWN_GAME_PROCESSES, exeKey, resolveGameName } from './games';

// Nomenclatura de los archivos que guarda la app (clips y capturas). Puro: lo usan la captura,
// las capturas de pantalla y la migración del layout viejo.
//
//   <carpeta de clips>/Terraria/Terraria 2026.07.02 - 10.02.01.01.mp4
//   <carpeta de clips>/ARC Raiders/Capturas/ARC Raiders Screenshot 2025.12.22 - 20.47.50.78.png
//   <carpeta de clips>/Desktop/Desktop 2026.07.02 - 10.02.01.01.mp4
//
// La base es el NOMBRE del juego, no su ejecutable: los clips de Arc Raiders van a `ARC Raiders/`,
// no a `pioneergame/`. El nombre lo resuelve `resolveGameName` (índice de launchers → lista curada →
// ejecutable), así que la identidad interna sigue siendo el `.exe` y esto es solo presentación.

/** Carpeta (y base del nombre) de todo lo que no pertenece a un juego. */
export const DESKTOP_FOLDER = 'Desktop';

/** Subcarpeta de las capturas de pantalla, dentro de la del juego. */
export const SCREENSHOTS_FOLDER = 'Capturas';

export type ClipKind = 'video' | 'screenshot';

// Caracteres que Windows no admite en nombres de archivo o carpeta. Los espacios se conservan: hay
// juegos como `Among Us`, y apóstrofos y acentos son legales (`Marvel's Spider-Man`, `Pokémon`).
// eslint-disable-next-line no-control-regex
const INVALID_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

// Legales en NTFS, pero incómodos en cuanto el nombre sale de él (consolas, URLs, otros sistemas).
const SIMBOLOS_DE_MARCA = /[™®©]/g;

// Windows reserva estos nombres de dispositivo: una carpeta `CON` no se puede crear.
const NOMBRES_RESERVADOS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Tope de la base: el límite de ruta de Windows son 260, y aún faltan carpeta, marca y extensión. */
export const CLIP_BASE_MAX = 64;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/**
 * Base del nombre a partir del **nombre del juego**: `ARC Raiders` → `ARC Raiders`,
 * `Marvel's Spider-Man: Miles Morales` → `Marvel's Spider-Man Miles Morales`. Sin juego (o con un
 * nombre que queda vacío al limpiarlo) → `Desktop`. La base es también el nombre de la carpeta.
 *
 * Sanea para Windows: fuera los caracteres prohibidos y los símbolos de marca, sin espacios dobles
 * ni punto/espacio final (Windows los rechaza), los nombres de dispositivo reservados desviados, y
 * la longitud acotada.
 */
export function clipBaseName(gameName: string | null | undefined): string {
  if (!gameName) return DESKTOP_FOLDER;

  const limpio = gameName
    .replace(/\.exe$/i, '') // tolerante: si alguien pasa un ejecutable, no se cuela la extensión
    .replace(SIMBOLOS_DE_MARCA, '')
    .replace(INVALID_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CLIP_BASE_MAX)
    .replace(/[. ]+$/, ''); // Windows no admite carpetas acabadas en punto o espacio

  if (!limpio) return DESKTOP_FOLDER;
  return NOMBRES_RESERVADOS.test(limpio) ? `${limpio} (juego)` : limpio;
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
 * `ARC Raiders Screenshot 2025.12.22 - 20.47.50.78.png`.
 */
export function clipFileName(opts: {
  gameName: string | null;
  date: Date;
  kind: ClipKind;
  extension: string;
}): string {
  const base = clipBaseName(opts.gameName);
  const marca = clipTimestamp(opts.date);
  const cuerpo = opts.kind === 'screenshot' ? `${base} Screenshot ${marca}` : `${base} ${marca}`;
  return `${cuerpo}.${opts.extension.replace(/^\./, '')}`;
}

/** Segmentos de carpeta (relativos a la carpeta de clips) donde va el archivo. */
export function clipFolderSegments(gameName: string | null, kind: ClipKind): string[] {
  const base = clipBaseName(gameName);
  return kind === 'screenshot' ? [base, SCREENSHOTS_FOLDER] : [base];
}

/**
 * Camino inverso de `clipBaseName`: la carpeta que contiene un archivo dice de qué juego es.
 *
 * Hay dos generaciones de carpetas y las dos tienen que resolver al MISMO nombre, o la biblioteca
 * mostraría el juego partido en dos:
 *
 * - Las viejas llevan el **ejecutable** (`acblackflag/`, `cs2/`) → se traducen con el índice de
 *   launchers y la lista curada, igual que hace la detección.
 * - Las nuevas llevan el **nombre ya saneado** (`Marvel's Spider-Man Miles Morales/`) → se busca el
 *   nombre del catálogo cuya base coincide, para recuperar el original con sus `:` y demás.
 *
 * Lo que no reconozca nadie (una carpeta que creó el usuario) se toma tal cual, que es lo que espera
 * ver. `Desktop` no es un juego: devuelve null.
 */
export function gameFromFolderName(folder: string, ctx: GameNameContext = {}): string | null {
  const limpio = folder.trim();
  if (!limpio || limpio.toLowerCase() === DESKTOP_FOLDER.toLowerCase()) return null;

  // Carpeta vieja: es un ejecutable.
  const key = exeKey(limpio);
  const esConocido =
    key in KNOWN_GAME_PROCESSES ||
    key in (ctx.index ?? {}) ||
    (ctx.customGames ?? []).some((g) => exeKey(g.executable) === key);
  if (esConocido) return resolveGameName(limpio, ctx);

  // Carpeta nueva: es un nombre saneado. Se recupera el nombre exacto del catálogo, si se conoce.
  const objetivo = limpio.toLowerCase();
  for (const nombre of nombresConocidos(ctx)) {
    if (clipBaseName(nombre).toLowerCase() === objetivo) return nombre;
  }
  return limpio;
}

/** Todos los nombres de juego que la app conoce ahora mismo (manuales, índice y lista curada). */
function nombresConocidos(ctx: GameNameContext): string[] {
  return [
    ...(ctx.customGames ?? []).map((g) => resolveGameName(g.executable, ctx)),
    ...Object.values(ctx.index ?? {}),
    ...Object.values(KNOWN_GAME_PROCESSES),
  ];
}
