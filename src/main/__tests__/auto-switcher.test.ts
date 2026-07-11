import { describe, expect, it } from 'vitest';
import type { RunningGameMatch } from '@shared/games';
import { AutoSwitcher } from '../capture/auto-switcher';

const JUEGOS: RunningGameMatch[] = [
  { name: 'Counter-Strike 2', executable: 'cs2.exe' },
  { name: 'Rocket League', executable: 'rocketleague.exe' },
];

function crear(threshold = 4) {
  const cambios: string[] = [];
  const sw = new AutoSwitcher({
    samplesBeforeSwitch: threshold,
    onSwitch: (name) => cambios.push(name),
  });
  return { sw, cambios };
}

describe('AutoSwitcher', () => {
  it('cambia tras 4 muestras consecutivas con otro juego en primer plano', () => {
    const { sw, cambios } = crear(4);
    // Activo = Counter-Strike 2; el foco está en Rocket League.
    for (let i = 0; i < 3; i++) {
      sw.update(JUEGOS, 'Rocket League', 'Counter-Strike 2');
      expect(cambios).toEqual([]); // aún no llega al umbral
    }
    sw.update(JUEGOS, 'Rocket League', 'Counter-Strike 2');
    expect(cambios).toEqual(['Rocket League']);
  });

  it('matchea por el título que contiene el nombre del juego (case-insensitive)', () => {
    const { sw, cambios } = crear(2);
    sw.update(JUEGOS, 'jugando a rocket league - stream', 'Counter-Strike 2');
    sw.update(JUEGOS, 'jugando a rocket league - stream', 'Counter-Strike 2');
    expect(cambios).toEqual(['Rocket League']);
  });

  it('matchea por el ejecutable sin extensión si el título no trae el nombre', () => {
    const { sw, cambios } = crear(2);
    sw.update(JUEGOS, 'RocketLeague', 'Counter-Strike 2');
    sw.update(JUEGOS, 'RocketLeague', 'Counter-Strike 2');
    expect(cambios).toEqual(['Rocket League']);
  });

  it('el foco intermitente no dispara el cambio (reinicia el conteo)', () => {
    const { sw, cambios } = crear(4);
    sw.update(JUEGOS, 'Rocket League', 'Counter-Strike 2');
    sw.update(JUEGOS, 'Rocket League', 'Counter-Strike 2');
    // El foco vuelve al juego activo: se reinicia el conteo.
    sw.update(JUEGOS, 'Counter-Strike 2', 'Counter-Strike 2');
    sw.update(JUEGOS, 'Rocket League', 'Counter-Strike 2');
    sw.update(JUEGOS, 'Rocket League', 'Counter-Strike 2');
    expect(cambios).toEqual([]); // nunca llegó a 4 seguidas
  });

  it('un título sin ningún juego reinicia el conteo', () => {
    const { sw, cambios } = crear(3);
    sw.update(JUEGOS, 'Rocket League', 'Counter-Strike 2');
    sw.update(JUEGOS, 'Visual Studio Code', 'Counter-Strike 2');
    sw.update(JUEGOS, 'Rocket League', 'Counter-Strike 2');
    sw.update(JUEGOS, 'Rocket League', 'Counter-Strike 2');
    expect(cambios).toEqual([]);
  });

  it('no cambia si el juego en primer plano ya es el activo', () => {
    const { sw, cambios } = crear(2);
    sw.update(JUEGOS, 'Counter-Strike 2', 'Counter-Strike 2');
    sw.update(JUEGOS, 'Counter-Strike 2', 'Counter-Strike 2');
    sw.update(JUEGOS, 'Counter-Strike 2', 'Counter-Strike 2');
    expect(cambios).toEqual([]);
  });

  it('un título nulo no dispara nada', () => {
    const { sw, cambios } = crear(1);
    sw.update(JUEGOS, null, 'Counter-Strike 2');
    expect(cambios).toEqual([]);
  });
});
