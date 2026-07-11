import { execFile } from 'node:child_process';
import type { AudioAppInfo } from '@shared/capture';

// Procesos que no tiene sentido ofrecer como fuente de audio por app.
const EXCLUDED = new Set(['electron', 'gameclip', 'explorer', 'textinputhost', 'systemsettings']);

const PS_COMMAND =
  'Get-Process | Where-Object { $_.MainWindowTitle } | ' +
  'Select-Object ProcessName, MainWindowTitle | ConvertTo-Json -Compress';

/**
 * Candidatos a captura de audio por app: procesos con ventana principal.
 * Aproximación pragmática — enumerar sesiones WASAPI reales exigiría un addon nativo.
 */
export function listAudioApps(): Promise<AudioAppInfo[]> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', PS_COMMAND],
      { timeout: 10000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => resolve(err ? [] : parseAudioApps(stdout)),
    );
  });
}

/** Parsea la salida JSON de PowerShell (objeto suelto si hay un solo proceso). */
export function parseAudioApps(stdout: string): AudioAppInfo[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  const items = Array.isArray(parsed) ? parsed : [parsed];
  const out: AudioAppInfo[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;
    const raw = item as Record<string, unknown>;
    if (typeof raw.ProcessName !== 'string' || !raw.ProcessName.trim()) continue;
    const name = raw.ProcessName.trim();
    const key = name.toLowerCase();
    if (EXCLUDED.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({
      executable: `${name}.exe`,
      windowTitle: typeof raw.MainWindowTitle === 'string' ? raw.MainWindowTitle : '',
    });
  }
  return out.sort((a, b) => a.executable.localeCompare(b.executable));
}
