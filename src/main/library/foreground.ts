import { execFile } from 'node:child_process';

// Nombre de la ventana en primer plano vía PowerShell (user32). Best-effort: cualquier
// fallo devuelve null; la detección seria de juegos llega en la Fase 6.
const SCRIPT = `
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

/**
 * Título de la ventana activa, o null si falla o si la ventana es de la propia app
 * (guardar desde la UI no debe anotar "GameClip" como juego).
 */
export function getForegroundWindowTitle(timeoutMs = 3000): Promise<string | null> {
  return new Promise((resolve) => {
    const child = execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', SCRIPT],
      { timeout: timeoutMs, windowsHide: true },
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
  });
}
