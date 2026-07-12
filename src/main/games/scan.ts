import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Escaneo de los ejecutables de la carpeta de un juego. Se indexan TODOS (no solo el que declare el
 * launcher): Fortnite arranca `FortniteClient-Win64-Shipping.exe`, que no es el `LaunchExecutable`
 * de su manifiesto, y Arc Raiders arranca `pioneergame.exe`. Sin esto, la detección seguiría ciega.
 */

/** Tope de profundidad: `Juego/Binaries/Win64/x.exe` cabe de sobra, y no nos comemos el árbol entero. */
export const MAX_SCAN_DEPTH = 4;

/** Carpetas que solo traen ruido: redistribuibles, anti-cheats y demás fauna. */
const CARPETAS_IGNORADAS = [
  /^_?commonredist$/i,
  /^redist/i,
  /^directx/i,
  /^dotnet/i,
  /^vc_?redist/i,
  /^easyanticheat/i,
  /^battleye/i,
  /^installers?$/i,
];

/**
 * Ejecutables auxiliares que viven en la carpeta del juego pero no SON el juego. Esta lista se ganó
 * a pulso: `EpicWebHelper.exe` está dentro de la carpeta de Fortnite, pero lo arranca el launcher de
 * Epic y corre SIEMPRE — sin filtrarlo, la app creía que Fortnite estaba abierto a todas horas.
 *
 * Los launchers y bootstrappers tampoco son el juego: el proceso real de Fortnite es
 * `FortniteClient-Win64-Shipping.exe`, no `FortniteLauncher.exe` ni `FortniteBootstrapper.exe`.
 */
const EXES_IGNORADOS = [
  /crashhandler/i,
  /crashreport/i,
  /crashpad/i,
  /helper/i, // EpicWebHelper y compañía: arrancan con el launcher, no con el juego
  /launcher/i,
  /bootstrapper/i,
  /^unins/i,
  /setup/i,
  /install/i,
  /redist/i,
  /^dxsetup$/i,
  /^vcredist/i,
  /anticheat/i,
  /_eac/i,
  /^be(service|_service)/i,
  /battleye/i,
  /eossdk/i,
  /^touchup$/i,
  /prereq/i,
  /^cef/i,
  /cefsubprocess/i,
];

export function ignorarCarpeta(nombre: string): boolean {
  return CARPETAS_IGNORADAS.some((re) => re.test(nombre));
}

export function ignorarExe(base: string): boolean {
  return EXES_IGNORADOS.some((re) => re.test(base));
}

/**
 * Nombres de los ejecutables de una carpeta de juego, sin extensión y en minúsculas (la clave que
 * usa el índice). Best-effort: una carpeta ilegible (permisos, unidad desconectada) devuelve lista
 * vacía en vez de romper el escaneo entero.
 */
export async function executablesIn(
  dir: string,
  maxDepth: number = MAX_SCAN_DEPTH,
): Promise<string[]> {
  const out: string[] = [];
  await walk(dir, maxDepth, out);
  return [...new Set(out)];
}

async function walk(dir: string, depthLeft: number, out: string[]): Promise<void> {
  if (depthLeft < 0) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // carpeta ilegible: se ignora, el resto del índice sigue
  }
  const subcarpetas: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignorarCarpeta(entry.name)) subcarpetas.push(join(dir, entry.name));
      continue;
    }
    if (!entry.name.toLowerCase().endsWith('.exe')) continue;
    const base = entry.name.slice(0, -4);
    if (ignorarExe(base)) continue;
    out.push(base.toLowerCase());
  }
  for (const sub of subcarpetas) await walk(sub, depthLeft - 1, out);
}
