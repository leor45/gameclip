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

/**
 * Tope de frecuencia del re-índice por novedad: cuando el sondeo ve un ejecutable desconocido (posible
 * juego recién instalado), pide reconstruir el índice, pero no más de una vez por esta ventana. No es
 * una espera antes de detectar —el primer desconocido dispara al instante—, sino un throttle para que
 * abrir varias apps de golpe no lance una ráfaga de PowerShell.
 */
export const UNKNOWN_EXE_REFRESH_COOLDOWN_MS = 30000;

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

/**
 * Juego del catálogo que el owner (o la sincronización) dice que **no** es un juego: ninguno de sus
 * ejecutables entra en el índice. La identidad es el nombre de catálogo, sin distinguir mayúsculas.
 *
 * - `auto`: lo añadió la sincronización con la lista curada (`NON_GAME_APPS`). Se quita sola si la app
 *   se desinstala; desactivarla es la forma de decir «sí es un juego» sin que vuelva a aparecer.
 * - `manual`: lo añadió el owner. La sincronización nunca lo toca.
 */
export interface ExcludedGame {
  name: string;
  source: 'auto' | 'manual';
  enabled: boolean;
}

/** Tope de la lista de exclusiones (sobra: es una lista de apps, no de exes). */
export const EXCLUDED_GAMES_MAX = 100;

/** Aplicación conocida que los launchers dan de alta pero que no es un juego. */
export interface NonGameApp {
  /** Nombre de referencia (documentación); el que se guarda es el del catálogo instalado. */
  name: string;
  /** Appids de Steam (lo más fiable: no cambian con el idioma ni con el ™). */
  steamAppIds: string[];
  /** Nombres de catálogo que también la identifican (minúsculas, comparación exacta). */
  names: string[];
}

/**
 * Lista curada de aplicaciones que no son juegos. Steam las instala como cualquier app y sus procesos
 * corren de fondo (Wallpaper Engine) o junto al juego (Lossless Scaling): sin excluirlas, la app cree
 * que hay un juego abierto. Ampliable: lo que falte se añade a mano desde Ajustes.
 */
export const NON_GAME_APPS: readonly NonGameApp[] = [
  { name: 'Wallpaper Engine', steamAppIds: ['431960'], names: ['wallpaper engine'] },
  { name: 'Lossless Scaling', steamAppIds: ['993090'], names: ['lossless scaling'] },
  {
    name: 'Steamworks Common Redistributables',
    steamAppIds: ['228980'],
    names: ['steamworks common redistributables'],
  },
  { name: 'SteamVR', steamAppIds: ['250820'], names: ['steamvr'] },
  { name: 'Soundpad', steamAppIds: ['629520'], names: ['soundpad'] },
  { name: 'OBS Studio', steamAppIds: ['1905180'], names: ['obs studio'] },
  { name: 'Blender', steamAppIds: ['365670'], names: ['blender'] },
  { name: 'VTube Studio', steamAppIds: ['1325860'], names: ['vtube studio'] },
  { name: 'Aseprite', steamAppIds: ['431730'], names: ['aseprite'] },
  { name: '3DMark', steamAppIds: ['223850'], names: ['3dmark'] },
];

/** Juego instalado tal como lo ve la UI (nombre de catálogo + launcher del que salió). */
export interface InstalledGameInfo {
  name: string;
  source: string;
}

/** Lo mínimo de un juego instalado que necesita la sincronización. */
export interface InstalledGameRef {
  name: string;
  steamAppId?: string;
}

const claveNombre = (name: string): string => name.trim().toLowerCase();

/** Nombres de catálogo instalados que la lista curada reconoce como «no es un juego». */
export function autoExclusions(installed: InstalledGameRef[]): string[] {
  const out: string[] = [];
  const vistos = new Set<string>();
  for (const juego of installed) {
    const name = juego.name.trim();
    const clave = claveNombre(name);
    if (!clave || vistos.has(clave)) continue;
    const esApp = NON_GAME_APPS.some(
      (app) =>
        (juego.steamAppId !== undefined && app.steamAppIds.includes(juego.steamAppId)) ||
        app.names.includes(clave),
    );
    if (!esApp) continue;
    vistos.add(clave);
    out.push(name);
  }
  return out;
}

/**
 * Sincroniza la lista con lo que la lista curada detecta ahora (`auto`):
 * - las manuales se conservan siempre, tal cual;
 * - las automáticas que siguen detectándose se conservan con su estado (activa o desactivada);
 * - cada candidato nuevo entra como `auto` activo **salvo** que ya haya una entrada con ese nombre
 *   (manual o automática, activa o no): ahí se salta;
 * - las automáticas que ya no se detectan (app desinstalada) se quitan.
 */
export function syncExcludedGames(actual: ExcludedGame[], auto: string[]): ExcludedGame[] {
  const detectados = new Set(auto.map(claveNombre));
  const out = actual.filter((e) => e.source === 'manual' || detectados.has(claveNombre(e.name)));
  const presentes = new Set(out.map((e) => claveNombre(e.name)));
  for (const name of auto) {
    const clave = claveNombre(name);
    if (presentes.has(clave)) continue;
    presentes.add(clave);
    out.push({ name: name.trim(), source: 'auto', enabled: true });
  }
  return out.slice(0, EXCLUDED_GAMES_MAX);
}

/** ¿Dos listas de exclusiones son iguales? (para no reescribir los ajustes sin motivo). */
export function sameExcludedGames(a: ExcludedGame[], b: ExcludedGame[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (e, i) => e.name === b[i].name && e.source === b[i].source && e.enabled === b[i].enabled,
    )
  );
}

/** Nombres (en minúsculas) de las exclusiones activas. */
export function activeExcludedNames(list: ExcludedGame[]): Set<string> {
  return new Set(list.filter((e) => e.enabled).map((e) => claveNombre(e.name)));
}

/** Normaliza la lista de origen no confiable (disco/IPC): sin vacíos ni duplicados, con tope. */
export function normalizeExcludedGames(value: unknown): ExcludedGame[] {
  if (!Array.isArray(value)) return [];
  const out: ExcludedGame[] = [];
  const vistos = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const raw = item as Record<string, unknown>;
    if (typeof raw.name !== 'string') continue;
    const name = raw.name.trim();
    const clave = claveNombre(name);
    if (!clave || vistos.has(clave)) continue;
    vistos.add(clave);
    out.push({
      name,
      source: raw.source === 'auto' ? 'auto' : 'manual',
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
    });
    if (out.length >= EXCLUDED_GAMES_MAX) break;
  }
  return out;
}

/**
 * ¿Fuerza el re-escaneo el rescan que pide el renderer (no confiable)? Solo un `force: false` explícito
 * pide un refresco normal («Sincronizar» de «no son juegos»); cualquier otra cosa —sin opciones
 * incluido, que es lo que manda «Volver a escanear»— fuerza.
 */
export function normalizeRescanForce(options: unknown): boolean {
  if (typeof options !== 'object' || options === null) return true;
  return (options as { force?: unknown }).force !== false;
}
