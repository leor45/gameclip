import type { RunningGameMatch } from '@shared/games';

export interface AutoSwitcherOptions {
  /** Muestras consecutivas con el mismo juego (distinto al activo) antes de cambiar. */
  samplesBeforeSwitch?: number;
  /** Se invoca con el nombre del juego al que hay que cambiar. */
  onSwitch: (gameName: string) => void;
}

/**
 * Decide si conviene cambiar el juego activo según la ventana en primer plano. Un poll
 * externo (5 s en producción, inyectable en tests) llama a `update` con los juegos en
 * ejecución, el título de la ventana activa y el juego activo actual. Si el título matchea
 * (case-insensitive) un juego DISTINTO del activo durante `samplesBeforeSwitch` muestras
 * seguidas, dispara `onSwitch`. Cualquier cambio de foco (a otro juego, a ninguno, o al
 * propio activo) reinicia el conteo.
 */
export class AutoSwitcher {
  private readonly threshold: number;
  private readonly onSwitch: (gameName: string) => void;
  private candidate: string | null = null;
  private count = 0;

  constructor(options: AutoSwitcherOptions) {
    this.threshold = options.samplesBeforeSwitch ?? 4;
    this.onSwitch = options.onSwitch;
  }

  update(
    runningGames: RunningGameMatch[],
    foregroundTitle: string | null,
    activeGameName: string | null,
  ): void {
    const matched = matchForeground(runningGames, foregroundTitle);
    // Solo interesa un juego en ejecución, distinto del que ya está activo.
    if (!matched || matched === activeGameName) {
      this.reset();
      return;
    }
    if (matched === this.candidate) {
      this.count++;
    } else {
      this.candidate = matched;
      this.count = 1;
    }
    if (this.count >= this.threshold) {
      this.reset();
      this.onSwitch(matched);
    }
  }

  private reset(): void {
    this.candidate = null;
    this.count = 0;
  }
}

/**
 * Juego cuya presencia en el título de la ventana activa lo delata (por nombre visible o por
 * ejecutable sin extensión), o null. Best-effort: muchos títulos incluyen el nombre del juego.
 */
function matchForeground(
  runningGames: RunningGameMatch[],
  title: string | null,
): string | null {
  if (!title) return null;
  const t = title.toLowerCase();
  for (const game of runningGames) {
    const name = game.name.toLowerCase();
    const exe = game.executable.toLowerCase().replace(/\.exe$/, '');
    if ((name && t.includes(name)) || (exe && t.includes(exe))) return game.name;
  }
  return null;
}
