import { describe, expect, it } from 'vitest';
import {
  KNOWN_GAME_PROCESSES,
  customExeMatches,
  findCustomGame,
  findRunningGame,
  findRunningGamesMatch,
  isManualGame,
  resolveGameName,
} from '../games';

describe('findRunningGame', () => {
  it('encuentra un juego conocido entre procesos comunes', () => {
    const procesos = ['explorer.exe', 'chrome.exe', 'VALORANT-Win64-Shipping.exe', 'code.exe'];
    expect(findRunningGame(procesos)).toBe('Valorant');
  });

  it('acepta nombres sin .exe y en cualquier capitalización', () => {
    expect(findRunningGame(['CS2'])).toBe('Counter-Strike 2');
    expect(findRunningGame(['RocketLeague'])).toBe('Rocket League');
    expect(findRunningGame(['eldenring.EXE'])).toBe('Elden Ring');
  });

  it('devuelve null sin coincidencias o con lista vacía', () => {
    expect(findRunningGame(['explorer.exe', 'svchost.exe'])).toBeNull();
    expect(findRunningGame([])).toBeNull();
    expect(findRunningGame(['', '   '])).toBeNull();
  });

  it('la lista curada usa claves normalizadas (minúsculas, sin .exe)', () => {
    for (const key of Object.keys(KNOWN_GAME_PROCESSES)) {
      expect(key).toBe(key.toLowerCase());
      expect(key.endsWith('.exe')).toBe(false);
    }
  });
});

describe('findRunningGamesMatch (multi-juego)', () => {
  it('devuelve TODOS los juegos conocidos en ejecución, en orden de aparición', () => {
    const procesos = [
      'explorer.exe',
      'cs2.exe',
      'chrome.exe',
      'RocketLeague.exe',
      'VALORANT-Win64-Shipping.exe',
    ];
    expect(findRunningGamesMatch(procesos)).toEqual([
      { name: 'Counter-Strike 2', executable: 'cs2.exe' },
      { name: 'Rocket League', executable: 'rocketleague.exe' },
      { name: 'Valorant', executable: 'valorant-win64-shipping.exe' },
    ]);
  });

  it('combina la lista curada con los ejecutables manuales', () => {
    const procesos = ['MiJuego.exe', 'cs2.exe'];
    const customGames = [{ executable: 'MiJuego.exe' }];
    expect(findRunningGamesMatch(procesos, { customGames })).toEqual([
      { name: 'MiJuego', executable: 'mijuego.exe' },
      { name: 'Counter-Strike 2', executable: 'cs2.exe' },
    ]);
  });

  it('un juego manual con nombre propio se muestra con ese nombre', () => {
    const customGames = [{ executable: 'MilesMorales.exe', name: 'Spiderman' }];
    expect(findRunningGamesMatch(['MilesMorales.exe'], { customGames })).toEqual([
      { name: 'Spiderman', executable: 'milesmorales.exe' },
    ]);
  });

  it('un juego manual SIN nombre se sigue llamando como su ejecutable (sin regresión)', () => {
    // El nombre conserva la capitalización de lo escrito por el owner, no la del proceso.
    expect(findRunningGamesMatch(['Otro.exe'], { customGames: [{ executable: 'Otro' }] })).toEqual([
      { name: 'Otro', executable: 'otro.exe' },
    ]);
    expect(findRunningGamesMatch(['Otro.exe'], { customGames: [{ executable: 'otro' }] })).toEqual([
      { name: 'otro', executable: 'otro.exe' },
    ]);
  });

  it('acepta procesos y manuales sin .exe y en cualquier capitalización', () => {
    expect(findRunningGamesMatch(['CS2'])).toEqual([
      { name: 'Counter-Strike 2', executable: 'cs2.exe' },
    ]);
    // Matchea sin importar la capitalización; el nombre visible es el de customGames.
    expect(findRunningGamesMatch(['JUEGO'], { customGames: [{ executable: 'Juego.EXE' }] })).toEqual(
      [{ name: 'Juego', executable: 'juego.exe' }],
    );
  });

  it('un juego manual dado de alta con la ruta completa también matchea (basename)', () => {
    const customGames = [{ executable: "F:\\SteamLibrary\\common\\Spidey\\MilesMorales.exe" }];
    expect(findRunningGamesMatch(['MilesMorales.exe'], { customGames })).toEqual([
      { name: 'MilesMorales', executable: 'milesmorales.exe' },
    ]);
  });

  it('deduplica por nombre visible cuando varios exes mapean al mismo juego', () => {
    // csgo y cs2 son ambos 'Counter-Strike 2': solo aparece una vez (el primero visto).
    const resultado = findRunningGamesMatch(['csgo.exe', 'cs2.exe']);
    expect(resultado).toEqual([{ name: 'Counter-Strike 2', executable: 'csgo.exe' }]);
  });

  it('devuelve lista vacía sin coincidencias', () => {
    expect(findRunningGamesMatch(['explorer.exe', 'svchost.exe'])).toEqual([]);
    expect(findRunningGamesMatch([])).toEqual([]);
  });
});

describe('juegos del índice de launchers (regresión: solo se detectaba la lista curada)', () => {
  // El bug: la ÚNICA fuente de juegos era KNOWN_GAME_PROCESSES, así que cualquier juego instalado
  // que no estuviera en esa tabla no se detectaba nunca y había que añadirlo a mano.
  const index = {
    pioneergame: 'ARC Raiders',
    milesmorales: "Marvel's Spider-Man: Miles Morales",
  };

  it('detecta un juego que solo conoce el índice, y lo nombra con el nombre del catálogo', () => {
    const procesos = ['explorer.exe', 'PioneerGame.exe', 'chrome.exe'];
    expect(findRunningGamesMatch(procesos, { index })).toEqual([
      { name: 'ARC Raiders', executable: 'pioneergame.exe' },
    ]);
  });

  it('el ejecutable sigue siendo la identidad interna, aunque no se parezca al nombre', () => {
    const [juego] = findRunningGamesMatch(['MilesMorales.exe'], { index });
    expect(juego.executable).toBe('milesmorales.exe');
    expect(juego.name).toBe("Marvel's Spider-Man: Miles Morales");
  });
});

describe('resolveGameName (prioridad de nombres)', () => {
  const index = { milesmorales: "Marvel's Spider-Man: Miles Morales", cs2: 'CS2 (del índice)' };

  it('el nombre manual del owner gana a todo', () => {
    const customGames = [{ executable: 'MilesMorales.exe', name: 'Spiderman' }];
    expect(resolveGameName('milesmorales.exe', { customGames, index })).toBe('Spiderman');
  });

  it('sin nombre manual, gana el índice de launchers', () => {
    const customGames = [{ executable: 'MilesMorales.exe' }];
    expect(resolveGameName('milesmorales.exe', { customGames, index })).toBe(
      "Marvel's Spider-Man: Miles Morales",
    );
  });

  it('el índice gana a la lista curada (es el juego realmente instalado)', () => {
    expect(resolveGameName('cs2.exe', { index })).toBe('CS2 (del índice)');
    expect(resolveGameName('cs2.exe')).toBe('Counter-Strike 2'); // sin índice, la curada
  });

  it('sin nada que lo identifique, el nombre es el ejecutable sin extensión', () => {
    expect(resolveGameName('MiJuego.exe')).toBe('MiJuego');
  });
});

describe('isManualGame', () => {
  it('es manual si su nombre coincide con un ejecutable de la lista del owner', () => {
    expect(isManualGame('MiJuego', { customGames: [{ executable: 'MiJuego.exe' }] })).toBe(true);
    // NTFS ignora la capitalización.
    expect(isManualGame('mijuego', { customGames: [{ executable: 'MIJUEGO.EXE' }] })).toBe(true);
  });

  it('sigue siendo manual aunque su nombre venga del índice o lo pusiera el owner', () => {
    const index = { milesmorales: "Marvel's Spider-Man: Miles Morales" };
    const customGames = [{ executable: 'MilesMorales.exe' }];
    expect(isManualGame("Marvel's Spider-Man: Miles Morales", { customGames, index })).toBe(true);

    const conNombre = [{ executable: 'MilesMorales.exe', name: 'Spiderman' }];
    expect(isManualGame('Spiderman', { customGames: conNombre, index })).toBe(true);
  });

  it('un juego de la lista curada no es manual', () => {
    expect(isManualGame('Terraria', { customGames: [{ executable: 'MiJuego.exe' }] })).toBe(false);
    expect(isManualGame('Terraria', {})).toBe(false);
  });

  it('sin juego activo no hay nada que marcar', () => {
    expect(isManualGame(null, { customGames: [{ executable: 'MiJuego.exe' }] })).toBe(false);
  });
});

describe('juegos manuales guardados con el nombre corrupto (regresión B3-1)', () => {
  // Antes de la 0.9.8 el selector de Ajustes → Grabación guardaba el `${ProcessName}.exe` que daba
  // PowerShell en la codepage OEM, y tasklist corrompía el proceso en marcha de la MISMA forma: el
  // `pokémonñゲ.exe` real se guardaba y se veía como `pok·mon·?.exe` (· = U+FFFD) y casaba. Con los
  // nombres ya intactos, esa entrada no volvía a casar nunca. `?` no es válido en un nombre de archivo
  // de Windows y U+FFFD no aparece en un exe real: una entrada con ellos es, sin ambigüedad, de antes.
  const R = String.fromCharCode(0xfffd);
  const corrupto = `pok${R}mon${R}?.exe`;
  const real = 'pokémonñゲ.exe';

  it('la entrada corrupta de antes del arreglo detecta al proceso real, con el nombre del owner', () => {
    const customGames = [{ executable: corrupto, name: 'Pokémon' }];
    expect(findRunningGamesMatch(['explorer.exe', real], { customGames })).toEqual([
      { name: 'Pokémon', executable: real },
    ]);
    // El nombre sigue saliendo de SU entrada: resolveGameName e isManualGame no cambian.
    expect(resolveGameName(corrupto, { customGames })).toBe('Pokémon');
    expect(isManualGame('Pokémon', { customGames })).toBe(true);
  });

  it('sin nombre propio, el juego se sigue llamando como antes del arreglo (misma carpeta de clips)', () => {
    const customGames = [{ executable: corrupto }];
    expect(findRunningGamesMatch([real], { customGames })).toEqual([
      { name: `pok${R}mon${R}?`, executable: real },
    ]);
  });

  it('las letras ASCII se comparan sin mayúsculas, como exeKey', () => {
    const customGames = [{ executable: `POK${R}MON${R}?.EXE`, name: 'Pokémon' }];
    expect(findRunningGamesMatch(['PokÉmonÑゲ.exe'], { customGames })).toEqual([
      { name: 'Pokémon', executable: 'pokémonñゲ.exe' },
    ]);
  });

  it('no casa con un nombre ASCII de la misma longitud ni con otro número de caracteres no ASCII', () => {
    const customGames = [{ executable: corrupto, name: 'Pokémon' }];
    for (const otro of [
      'pokxmonxx.exe', // misma longitud, todo ASCII
      'pokemonñゲ.exe', // ASCII donde la entrada exige un no ASCII
      'pokémonñ.exe', // uno menos
      'pokémonñゲゲ.exe', // uno más
      'pokémonñゲx.exe', // sobra un ASCII
      'pakémonñゲ.exe', // difiere una letra ASCII
    ]) {
      expect(findRunningGamesMatch([otro], { customGames }), otro).toEqual([]);
    }
  });

  it('las entradas exactas no cambian y tienen prioridad sobre una corrupta', () => {
    const customGames = [
      { executable: corrupto, name: 'Viejo' },
      { executable: real, name: 'Nuevo' },
    ];
    expect(findRunningGamesMatch([real], { customGames })).toEqual([
      { name: 'Nuevo', executable: real },
    ]);
    expect(findCustomGame(customGames, 'pokémonñゲ')?.name).toBe('Nuevo');
    // Una entrada sin `?` ni U+FFFD nunca es comodín: `pokemon.exe` no es `pokémon.exe`.
    expect(
      findRunningGamesMatch(['pokémon.exe'], { customGames: [{ executable: 'pokemon.exe' }] }),
    ).toEqual([]);
  });

  it('customExeMatches: cada comodín vale por exactamente UN carácter no ASCII (también fuera del BMP)', () => {
    expect(customExeMatches('a?b', 'aéb')).toBe(true);
    expect(customExeMatches(`a${R}b`, 'aゲb')).toBe(true);
    expect(customExeMatches('a?b', `a${String.fromCodePoint(0x1f3ae)}b`)).toBe(true);
    expect(customExeMatches('a?b', 'ab')).toBe(false);
    expect(customExeMatches('a?b', 'axb')).toBe(false);
    expect(customExeMatches('a?b', 'aééb')).toBe(false);
    expect(customExeMatches('ab', 'ab')).toBe(true);
    expect(customExeMatches('ab', 'aB')).toBe(false); // recibe claves ya normalizadas por exeKey
  });
});
