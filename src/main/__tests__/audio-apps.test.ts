import { describe, expect, it } from 'vitest';
import { parseAudioApps } from '../capture/audio-apps';

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
