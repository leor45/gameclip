import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { app, nativeImage, type NativeImage } from 'electron';
import { exePathsIn } from '../games/scan';
import { BuscadorRutas } from './rutas-procesos';
import { IconService, LADO_ICONO, type DependenciasIconos } from './servicio';

export { IconService } from './servicio';
export { recordarRutaProceso } from './rutas-procesos';

/**
 * Pegamento con Electron: `app.getFileIcon` para los exes, `nativeImage` para los logos de paquete y
 * PowerShell (bajo demanda) para las rutas de procesos y de paquetes de la Store. La lógica vive en
 * `servicio.ts`, que no depende de Electron.
 */

/** Reduce a ≤ 64 px (manteniendo la proporción) y devuelve el PNG; null si la imagen está vacía. */
export function pngAjustado(img: NativeImage): Buffer | null {
  if (img.isEmpty()) return null;
  const { width, height } = img.getSize();
  if (width <= 0 || height <= 0) return null;
  // Solo se reduce: ampliar no añade detalle (lo hace igual el CSS) y engorda el data URL.
  const ajustada =
    Math.max(width, height) <= LADO_ICONO
      ? img
      : img.resize(
          width >= height
            ? { width: LADO_ICONO, quality: 'best' }
            : { height: LADO_ICONO, quality: 'best' },
        );
  const png = ajustada.toPNG();
  return png.length > 0 ? png : null;
}

/** Script de `InstallLocation` de un paquete; nombre y familia por entorno, nunca interpolados. */
const PS_PAQUETE =
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8; ' +
  'Get-AppxPackage -Name $env:GAMECLIP_PAQUETE -ErrorAction SilentlyContinue | ' +
  'Where-Object { $_.PackageFamilyName -eq $env:GAMECLIP_FAMILIA } | ' +
  'Select-Object -First 1 -ExpandProperty InstallLocation';

/** `InstallLocation` de un paquete de la Store por su `PackageFamilyName` (`Nombre_editor`). */
export function carpetaDePaquetePowerShell(familia: string): Promise<string | null> {
  const nombre = familia.slice(0, familia.lastIndexOf('_'));
  if (!nombre || /[*?[\]]/.test(nombre)) return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', PS_PAQUETE],
      {
        timeout: 15000,
        windowsHide: true,
        encoding: 'utf8',
        env: { ...process.env, GAMECLIP_PAQUETE: nombre, GAMECLIP_FAMILIA: familia },
      },
      (err, stdout) => {
        const carpeta = err ? '' : stdout.trim().split(/\r?\n/)[0]?.trim();
        resolve(carpeta && /^[a-z]:[\\/]/i.test(carpeta) ? carpeta : null);
      },
    );
  });
}

export type FuentesDeJuegos = Pick<
  DependenciasIconos,
  'index' | 'installed' | 'customGames' | 'runningGames'
>;

/** El servicio real, con Electron. Llamar después de `app.whenReady()`. */
export function createIconService(
  juegos: FuentesDeJuegos,
  log: (msg: string) => void = (msg) => console.warn(msg),
): IconService {
  const buscador = new BuscadorRutas();
  return new IconService({
    ...juegos,
    cacheDir: join(app.getPath('userData'), 'icons'),
    iconoDeArchivo: async (ruta) => pngAjustado(await app.getFileIcon(ruta, { size: 'large' })),
    imagenDeArchivo: async (ruta) => pngAjustado(nativeImage.createFromPath(ruta)),
    rutaDeProceso: (claves) => buscador.buscar(claves),
    exesDeCarpeta: (dir) => exePathsIn(dir),
    carpetaDePaquete: carpetaDePaquetePowerShell,
    log,
  });
}
