import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Argumentos y entorno de powershell.exe para copiar un archivo al portapapeles (puros, para
 * testearlos). La ruta NO se interpola en el script: viaja en una variable de entorno del hijo.
 * PowerShell trata ‘ ’ ‚ ‛ como comillas simples, así que escapar solo la ' ASCII no bastaba: una
 * ruta con «Marvel’s…» cerraba la cadena antes de tiempo (ParserError) y «Copiar» fallaba.
 */
export function setClipboardFileCommand(
  path: string,
  baseEnv: NodeJS.ProcessEnv = process.env,
): { args: string[]; env: NodeJS.ProcessEnv } {
  return {
    args: [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Set-Clipboard -LiteralPath $env:GAMECLIP_CLIP_PATH',
    ],
    env: { ...baseEnv, GAMECLIP_CLIP_PATH: path },
  };
}

// Electron no expone CF_HDROP (archivos) en su API de portapapeles: se delega en
// PowerShell, que sí arma la lista de archivos pegable en Explorer/Discord.
export function copyFileToClipboard(path: string | null): Promise<boolean> {
  return new Promise((resolve) => {
    if (!path || !existsSync(path)) return resolve(false);
    const { args, env } = setClipboardFileCommand(path);
    execFile('powershell.exe', args, { timeout: 5000, windowsHide: true, env }, (err) =>
      resolve(!err),
    );
  });
}
