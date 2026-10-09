import { describe, expect, it } from 'vitest';
import { foregroundWindowArgs } from '../library/foreground';

describe('foregroundWindowArgs (título de la ventana en primer plano)', () => {
  it('fuerza la salida de PowerShell a UTF-8 antes de escribir el título (regresión D5-BUG-5)', () => {
    // Sin esto PowerShell escribe en la codepage OEM de la consola (850 en un Windows en español) y
    // Node lo decodifica como UTF-8: en «Pokémon» la é llegaba como U+FFFD (medido) y el auto-cambio
    // de juego no reconocía por título a los juegos con acentos.
    const args = foregroundWindowArgs();
    expect(args).toHaveLength(4);
    expect(args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-Command']);
    const script = args[3];
    const utf8 = script.indexOf('[Console]::OutputEncoding = [Text.Encoding]::UTF8');
    expect(utf8).toBeGreaterThanOrEqual(0);
    expect(utf8).toBeLessThan(script.indexOf('Write-Output'));
  });
});
