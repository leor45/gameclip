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

/** Juego añadido a mano: el ejecutable es la identidad; el nombre, opcional, es solo presentación. */
export interface CustomGame {
  /** Ejecutable del juego (p. ej. `MilesMorales.exe`). */
  executable: string;
  /** Nombre elegido por el owner. Vacío/ausente: se deduce (índice → lista curada → ejecutable). */
  name?: string;
}

/**
 * Juegos instalados que la app encontró en los launchers del PC (Steam, Epic, …).
 * Clave: el ejecutable normalizado (`exeKey`). Valor: el nombre del catálogo.
 * Es lo que permite detectar un juego que no está en la lista curada, y nombrarlo bien:
 * `pioneergame` → `ARC Raiders`.
 */
export type GameIndex = Record<string, string>;

/** De dónde salen los nombres de los juegos. Todo opcional: sin nada, se cae a la lista curada. */
export interface GameNameContext {
  customGames?: CustomGame[];
  index?: GameIndex;
}

/** Clave de un ejecutable: sin carpeta, sin extensión, en minúsculas. `D:\X\CS2.EXE` → `cs2`. */
export function exeKey(executable: string): string {
  const base = executable.trim().split(/[\\/]/).pop() ?? '';
  return base.toLowerCase().replace(/\.exe$/, '');
}

/** El ejecutable sin carpeta ni extensión, conservando la capitalización: `D:\X\CS2.exe` → `CS2`. */
function exeBaseName(executable: string): string {
  const base = executable.trim().split(/[\\/]/).pop() ?? '';
  return base.replace(/\.exe$/i, '');
}

export interface RunningGameMatch {
  /** Nombre para mostrar y catalogar. */
  name: string;
  /** Ejecutable real que matcheó (p. ej. cs2.exe) — varios exes mapean al mismo juego. */
  executable: string;
}

/**
 * Nombre visible de un juego a partir de su ejecutable. **Única fuente de verdad del nombre**:
 * lo usan la detección, la barra de captura, los ajustes y el naming de los clips.
 *
 *   nombre manual del owner → índice de launchers → lista curada → ejecutable sin extensión
 *
 * El `FileDescription` del `.exe` no entra aquí: leerlo toca el disco, así que se consulta solo
 * al dar de alta un juego a mano (para pre-rellenar el nombre), nunca en el sondeo.
 */
export function resolveGameName(executable: string, ctx: GameNameContext = {}): string {
  const key = exeKey(executable);
  const manual = (ctx.customGames ?? []).find((g) => exeKey(g.executable) === key);
  const manualName = manual?.name?.trim();
  if (manualName) return manualName;
  return ctx.index?.[key] ?? KNOWN_GAME_PROCESSES[key] ?? exeBaseName(manual?.executable ?? executable);
}

/**
 * Devuelve TODOS los juegos en ejecución —los que conoce el índice de launchers, la lista curada
 * o la lista de juegos manuales—, sin duplicados por nombre y en el orden de aparición en la lista
 * de procesos. Acepta nombres con o sin `.exe` y en cualquier capitalización.
 */
export function findRunningGamesMatch(
  processNames: string[],
  ctx: GameNameContext = {},
): RunningGameMatch[] {
  const custom = new Map<string, CustomGame>();
  for (const juego of ctx.customGames ?? []) {
    const key = exeKey(juego.executable);
    if (key) custom.set(key, juego);
  }

  const out: RunningGameMatch[] = [];
  const seen = new Set<string>();
  for (const raw of processNames) {
    const key = exeKey(raw);
    if (!key) continue;
    const manual = custom.get(key);
    const esJuego = manual !== undefined || key in (ctx.index ?? {}) || key in KNOWN_GAME_PROCESSES;
    if (!esJuego) continue;
    // El nombre de un juego manual se resuelve desde SU entrada, que conserva la capitalización
    // que escribió el owner; la del proceso la impone tasklist.
    const name = resolveGameName(manual?.executable ?? raw, ctx);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, executable: `${key}.exe` });
  }
  return out;
}

/**
 * ¿El juego activo lo añadió el owner a mano, o lo reconoció la app sola? Se cruza el nombre visible
 * con el que resolvería cada juego manual: así funciona igual lleve nombre propio, venga del índice
 * o se llame como su ejecutable.
 */
export function isManualGame(name: string | null, ctx: GameNameContext = {}): boolean {
  if (!name) return false;
  const key = name.trim().toLowerCase();
  return (ctx.customGames ?? []).some(
    (juego) => resolveGameName(juego.executable, ctx).trim().toLowerCase() === key,
  );
}

/**
 * Busca un juego en una lista de nombres de proceso. Acepta nombres con o sin `.exe` y en
 * cualquier capitalización; devuelve el match (nombre + ejecutable) o null.
 */
export function findRunningGameMatch(
  processNames: string[],
  ctx: GameNameContext = {},
): RunningGameMatch | null {
  return findRunningGamesMatch(processNames, ctx)[0] ?? null;
}

/** Compat: solo el nombre para mostrar. */
export function findRunningGame(processNames: string[], ctx: GameNameContext = {}): string | null {
  return findRunningGameMatch(processNames, ctx)?.name ?? null;
}
