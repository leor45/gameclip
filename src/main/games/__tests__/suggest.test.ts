import { describe, expect, it, vi } from 'vitest';
import { suggestGameName } from '../suggest';

const sinMetadatos = () => Promise.resolve(null);

describe('suggestGameName', () => {
  it('propone el nombre del catálogo cuando el juego está en el índice', async () => {
    const index = { pioneergame: 'ARC Raiders' };
    expect(await suggestGameName('PioneerGame.exe', { index }, sinMetadatos)).toBe('ARC Raiders');
  });

  it('cae a la lista curada si el launcher no lo conoce', async () => {
    expect(await suggestGameName('cs2.exe', {}, sinMetadatos)).toBe('Counter-Strike 2');
  });

  it('sin índice ni lista curada, pregunta al propio ejecutable', async () => {
    // El MilesMorales.exe de Steam declara literalmente el nombre completo del juego.
    const metadata = vi.fn().mockResolvedValue("Marvel's Spider-Man: Miles Morales");
    expect(await suggestGameName('MilesMorales.exe', {}, metadata)).toBe(
      "Marvel's Spider-Man: Miles Morales",
    );
    expect(metadata).toHaveBeenCalledWith('MilesMorales.exe');
  });

  it('no consulta los metadatos si ya sabe el nombre (no toca el disco de más)', async () => {
    const metadata = vi.fn();
    await suggestGameName('cs2.exe', {}, metadata);
    expect(metadata).not.toHaveBeenCalled();
  });

  it('null cuando no se deduce nada: el juego se llamará como su ejecutable', async () => {
    expect(await suggestGameName('JuegoRaro.exe', {}, sinMetadatos)).toBeNull();
    expect(await suggestGameName('  ', {}, sinMetadatos)).toBeNull();
  });
});
