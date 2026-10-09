import { execFile } from 'node:child_process';

// Nombre de la ventana en primer plano vía PowerShell (user32). Best-effort: cualquier
// fallo devuelve null; la detección seria de juegos llega en la Fase 6.
// Salida forzada a UTF-8 (como en games/powershell.ts): sin ello PowerShell escribe en la codepage
// OEM de la consola (850 en español) y en un título como «Pokémon» la é llegaba como U+FFFD.
const SCRIPT = `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class FG {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
"@
$h = [FG]::GetForegroundWindow()
$procId = 0
[void][FG]::GetWindowThreadProcessId($h, [ref]$procId)
$p = Get-Process -Id $procId -ErrorAction SilentlyContinue
if ($p) {
  $t = if ($p.MainWindowTitle) { $p.MainWindowTitle } else { $p.ProcessName }
  Write-Output "$procId|$t"
}
`;

/** Argumentos de powershell.exe para leer la ventana en primer plano (puros, para testearlos). */
export function foregroundWindowArgs(): string[] {
  return ['-NoProfile', '-NonInteractive', '-Command', SCRIPT];
}

/**
 * Título de la ventana activa, o null si falla o si la ventana es de la propia app
 * (guardar desde la UI no debe anotar "GameClip" como juego).
 */
export function getForegroundWindowTitle(timeoutMs = 3000): Promise<string | null> {
  return new Promise((resolve) => {
    // `execFile` también puede LANZAR en síncrono (fallo de spawn): dentro del executor eso rechazaría
    // la promesa, y los llamadores (el intervalo del auto-cambio) esperan null, no una excepción.
    try {
      const child = execFile(
        'powershell.exe',
        foregroundWindowArgs(),
        { timeout: timeoutMs, windowsHide: true, encoding: 'utf8' },
        (err, stdout) => {
          if (err) return resolve(null);
          const line = stdout.trim().split(/\r?\n/)[0] ?? '';
          const sep = line.indexOf('|');
          if (sep < 0) return resolve(null);
          const pid = Number(line.slice(0, sep));
          const title = line.slice(sep + 1).trim();
          if (!title || pid === process.pid) return resolve(null);
          resolve(title);
        },
      );
      child.on('error', () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}
