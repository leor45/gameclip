import { execFile } from 'node:child_process';
import type { AudioAppInfo } from '@shared/capture';
import { recordarRutaProceso } from '../icons/rutas-procesos';

// Procesos que no tiene sentido ofrecer como fuente de audio por app.
const EXCLUDED = new Set(['electron', 'gameclip', 'explorer', 'textinputhost', 'systemsettings']);

// Salida forzada a UTF-8 (como en games/powershell.ts): sin ello PowerShell escribe en la codepage
// OEM de la consola (850 en español) y los nombres/títulos con acentos, ñ o CJK llegaban corruptos.
// `Path` va de paso para el servicio de iconos: así el icono de cada app sale sin otra consulta.
const PS_COMMAND =
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8; ' +
  'Get-Process | Where-Object { $_.MainWindowTitle } | ' +
  'Select-Object ProcessName, MainWindowTitle, Path | ConvertTo-Json -Compress';

// Caché corto: cada montaje de la sección Audio pide la lista; sin caché, cada
// navegación de Ajustes spawnearía un powershell.exe nuevo.
const CACHE_TTL_MS = 5000;
let cache: { at: number; apps: AudioAppInfo[] } | null = null;

/** Argumentos de powershell.exe para listar los procesos con ventana (puros, para testearlos). */
export function audioAppsArgs(): string[] {
  return ['-NoProfile', '-NonInteractive', '-Command', PS_COMMAND];
}

/**
 * Candidatos a captura de audio por app: procesos con ventana principal.
 * Aproximación pragmática — enumerar sesiones WASAPI reales exigiría un addon nativo.
 */
export function listAudioApps(): Promise<AudioAppInfo[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return Promise.resolve(cache.apps);
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      audioAppsArgs(),
      { timeout: 10000, windowsHide: true, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout) => {
        const apps = err ? [] : parseAudioApps(stdout);
        if (!err) cache = { at: Date.now(), apps };
        resolve(apps);
      },
    );
  });
}

/** Parsea la salida JSON de PowerShell (objeto suelto si hay un solo proceso). */
export function parseAudioApps(stdout: string): AudioAppInfo[] {
  let parsed: unknown;
  try {
    // trim(): JSON.parse no acepta un BOM inicial (PowerShell no lo escribe hoy, pero sería un
    // selector vacío por un solo carácter invisible).
    parsed = JSON.parse(stdout.trim());
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
    if (typeof raw.Path === 'string') recordarRutaProceso(raw.Path);
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
