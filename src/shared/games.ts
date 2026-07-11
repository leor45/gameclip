// Detección de juegos: lista curada de procesos y matching puro (sin dependencias de main).
// La clave es el nombre del proceso en minúsculas y sin extensión, tal como lo reporta
// tasklist/Get-Process; el valor es el nombre para mostrar y catalogar.

export const KNOWN_GAME_PROCESSES: Record<string, string> = {
  // Shooters
  valorant: 'Valorant',
  'valorant-win64-shipping': 'Valorant',
  csgo: 'Counter-Strike 2',
  cs2: 'Counter-Strike 2',
  fortniteclient: 'Fortnite',
  'fortniteclient-win64-shipping': 'Fortnite',
  r5apex: 'Apex Legends',
  r5apex_dx12: 'Apex Legends',
  overwatch: 'Overwatch 2',
  rainbowsix: 'Rainbow Six Siege',
  rainbowsix_dx11: 'Rainbow Six Siege',
  modernwarfare: 'Call of Duty',
  cod: 'Call of Duty',
  bf2042: 'Battlefield 2042',
  destiny2: 'Destiny 2',
  huntgame: 'Hunt: Showdown',
  tslgame: 'PUBG: Battlegrounds',
  deltaforceclient: 'Delta Force',
  marvel: 'Marvel Rivals',
  'marvel-win64-shipping': 'Marvel Rivals',
  thefinals: 'The Finals',
  discovery: 'The Finals',
  // MOBA / estrategia
  'league of legends': 'League of Legends',
  dota2: 'Dota 2',
  smite: 'Smite',
  starcraft2: 'StarCraft II',
  aoe4: 'Age of Empires IV',
  // Battle royale / supervivencia / mundo abierto
  gta5: 'Grand Theft Auto V',
  gta5_enhanced: 'Grand Theft Auto V',
  rdr2: 'Red Dead Redemption 2',
  rustclient: 'Rust',
  dayz_x64: 'DayZ',
  minecraft: 'Minecraft',
  javaw: 'Minecraft (Java)',
  eldenring: 'Elden Ring',
  cyberpunk2077: 'Cyberpunk 2077',
  witcher3: 'The Witcher 3',
  palworld: 'Palworld',
  'palworld-win64-shipping': 'Palworld',
  helldivers2: 'Helldivers 2',
  // Deportes / carreras
  fc24: 'EA Sports FC',
  fc25: 'EA Sports FC',
  rocketleague: 'Rocket League',
  forzahorizon5: 'Forza Horizon 5',
  // Otros populares
  genshinimpact: 'Genshin Impact',
  starrail: 'Honkai: Star Rail',
  wuthering: 'Wuthering Waves',
  roblox: 'Roblox',
  robloxplayerbeta: 'Roblox',
  terraria: 'Terraria',
  hades2: 'Hades II',
  baldursgate3: "Baldur's Gate 3",
  bg3: "Baldur's Gate 3",
  bg3_dx11: "Baldur's Gate 3",
  wow: 'World of Warcraft',
  ffxiv_dx11: 'Final Fantasy XIV',
  deadlock: 'Deadlock',
};

/** Intervalo de sondeo de procesos por defecto. */
export const GAME_POLL_INTERVAL_MS = 5000;

export interface RunningGameMatch {
  /** Nombre para mostrar y catalogar. */
  name: string;
  /** Ejecutable real que matcheó (p. ej. cs2.exe) — varios exes mapean al mismo juego. */
  executable: string;
}

/**
 * Devuelve TODOS los juegos conocidos en ejecución (lista curada + ejecutables manuales),
 * sin duplicados por nombre y en el orden de aparición en la lista de procesos. Acepta
 * nombres con o sin `.exe` y en cualquier capitalización. El nombre visible de un juego
 * manual es su ejecutable sin extensión.
 */
export function findRunningGamesMatch(
  processNames: string[],
  customGames: string[] = [],
): RunningGameMatch[] {
  const custom = new Map<string, string>();
  for (const exe of customGames) {
    const key = exe.trim().toLowerCase().replace(/\.exe$/, '');
    if (key) custom.set(key, exe.trim().replace(/\.exe$/i, ''));
  }

  const out: RunningGameMatch[] = [];
  const seen = new Set<string>();
  for (const raw of processNames) {
    const name = raw.trim().toLowerCase().replace(/\.exe$/, '');
    if (!name) continue;
    const game = KNOWN_GAME_PROCESSES[name] ?? custom.get(name);
    if (!game || seen.has(game)) continue;
    seen.add(game);
    out.push({ name: game, executable: `${name}.exe` });
  }
  return out;
}

/**
 * Busca un juego conocido en una lista de nombres de proceso. Acepta nombres con o sin
 * `.exe` y en cualquier capitalización; devuelve el match (nombre + ejecutable) o null.
 */
export function findRunningGameMatch(processNames: string[]): RunningGameMatch | null {
  return findRunningGamesMatch(processNames)[0] ?? null;
}

/** Compat: solo el nombre para mostrar. */
export function findRunningGame(processNames: string[]): string | null {
  return findRunningGameMatch(processNames)?.name ?? null;
}
