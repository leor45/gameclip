import { describe, expect, it } from 'vitest';
import { audioAppsArgs, parseAudioApps } from '../capture/audio-apps';

describe('audioAppsArgs (procesos con ventana vía PowerShell)', () => {
  it('fuerza la salida a UTF-8 antes del ConvertTo-Json, con el pipeline intacto (regresión D4-BUG-2)', () => {
    // Sin esto PowerShell escribe en la codepage OEM (850): nombres y títulos con acentos, ñ o CJK
    // llegaban corruptos a los selectores de apps, y un .exe no ASCII se guardaba con el nombre roto.
    expect(audioAppsArgs()).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '[Console]::OutputEncoding = [Text.Encoding]::UTF8; ' +
        'Get-Process | Where-Object { $_.MainWindowTitle } | ' +
        'Select-Object ProcessName, MainWindowTitle | ConvertTo-Json -Compress',
    ]);
  });
});

describe('parseAudioApps (salida JSON de PowerShell)', () => {
  it('parsea un array de procesos y añade la extensión .exe (orden alfabético)', () => {
    const stdout = JSON.stringify([
      { ProcessName: 'Discord', MainWindowTitle: 'Discord' },
      { ProcessName: 'chrome', MainWindowTitle: 'GitHub' },
    ]);
    expect(parseAudioApps(stdout)).toEqual([
      { executable: 'chrome.exe', windowTitle: 'GitHub' },
      { executable: 'Discord.exe', windowTitle: 'Discord' },
    ]);
  });

  it('acepta un objeto suelto (un solo proceso con ventana)', () => {
    const stdout = JSON.stringify({ ProcessName: 'Spotify', MainWindowTitle: 'Spotify Premium' });
    expect(parseAudioApps(stdout)).toEqual([
      { executable: 'Spotify.exe', windowTitle: 'Spotify Premium' },
    ]);
  });

  it('conserva acentos, ñ, CJK y comillas tipográficas', () => {
    const stdout = JSON.stringify([
      { ProcessName: 'Pokémon', MainWindowTitle: 'Mañana — ゲーム · Marvel’s' },
    ]);
    expect(parseAudioApps(stdout)).toEqual([
      { executable: 'Pokémon.exe', windowTitle: 'Mañana — ゲーム · Marvel’s' },
    ]);
  });

  it('tolera un BOM UTF-8 y saltos de línea alrededor del JSON', () => {
    const bom = String.fromCharCode(0xfeff);
    const json = JSON.stringify([{ ProcessName: 'Discord', MainWindowTitle: 'Discord' }]);
    const stdout = `${bom}${json}\r\n`;
    expect(parseAudioApps(stdout)).toEqual([{ executable: 'Discord.exe', windowTitle: 'Discord' }]);
  });

  it('devuelve [] ante JSON inválido o basura', () => {
    expect(parseAudioApps('esto no es json')).toEqual([]);
    expect(parseAudioApps('')).toEqual([]);
  });

  it('excluye procesos del sistema/propios y entradas sin ProcessName', () => {
    const stdout = JSON.stringify([
      { ProcessName: 'explorer', MainWindowTitle: 'Explorador' },
      { ProcessName: 'GameClip', MainWindowTitle: 'GameClip' },
      { MainWindowTitle: 'sin nombre de proceso' },
      { ProcessName: '   ', MainWindowTitle: 'nombre en blanco' },
      { ProcessName: 'Discord', MainWindowTitle: 'Discord' },
    ]);
    expect(parseAudioApps(stdout)).toEqual([
      { executable: 'Discord.exe', windowTitle: 'Discord' },
    ]);
  });

  it('deduplica por nombre de proceso sin distinguir mayúsculas', () => {
    const stdout = JSON.stringify([
      { ProcessName: 'Discord', MainWindowTitle: 'Ventana 1' },
      { ProcessName: 'discord', MainWindowTitle: 'Ventana 2' },
    ]);
    expect(parseAudioApps(stdout)).toEqual([
      { executable: 'Discord.exe', windowTitle: 'Ventana 1' },
    ]);
  });

  it('ordena el resultado alfabéticamente por ejecutable', () => {
    const stdout = JSON.stringify([
      { ProcessName: 'Zoom', MainWindowTitle: 'Zoom' },
      { ProcessName: 'Discord', MainWindowTitle: 'Discord' },
    ]);
    expect(parseAudioApps(stdout).map((a) => a.executable)).toEqual([
      'Discord.exe',
      'Zoom.exe',
    ]);
  });
});
