import { clampTrackGain } from '@shared/tracks';

// Motor de audio en vivo del editor avanzado (Fase 2): reconstruye la mezcla desde las pistas
// desglosadas con la Web Audio API (una pista → GainNode → masterGain → destino), colgada del reloj
// del <video> (mudo). El navegador solo decodifica la mezcla `default`, así que el audio real por
// pista lo extrae el main con ffmpeg y aquí se decodifica a un AudioBuffer por pista.
//
// Sin AudioContext (jsdom en tests, o un entorno raro) el motor es un no-op silencioso: guarda el
// estado y sale, y el editor cae a reproducir el audio propio del <video> (la mezcla original).

/** Umbral de deriva (segundos) audio↔vídeo por encima del cual se re-sincroniza el audio. */
export const RESYNC_THRESHOLD_SECONDS = 0.15;

/** Constante de tiempo (segundos) de la rampa de volumen: evita clicks al cambiar la ganancia. */
const GAIN_RAMP_SECONDS = 0.02;

/** ¿El audio se ha separado del vídeo más que el umbral? Puro y testeable. */
export function shouldResync(
  audioTime: number,
  videoTime: number,
  threshold: number = RESYNC_THRESHOLD_SECONDS,
): boolean {
  if (!Number.isFinite(audioTime) || !Number.isFinite(videoTime)) return false;
  return Math.abs(audioTime - videoTime) > threshold;
}

/** Ganancia efectiva de una pista: eliminada ⇒ 0; si no, la ganancia acotada. Puro y testeable. */
export function effectiveGain(gain: number, removed: boolean): number {
  return removed ? 0 : clampTrackGain(gain);
}

type AudioContextCtor = new () => AudioContext;

/** Constructor de `AudioContext` disponible, o null (jsdom / sin Web Audio). */
function resolveAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

interface TrackNode {
  gain: GainNode;
  buffer: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
}

/** Cómo obtener los bytes (AAC/ADTS) de una pista, por su clave. */
export type FetchTrackAudio = (key: string) => Promise<ArrayBuffer>;

/** Fábrica del contexto de audio; inyectable para tests (OfflineAudioContext). */
export type AudioContextFactory = () => BaseAudioContext | null;

const defaultFactory: AudioContextFactory = () => {
  const Ctor = resolveAudioContextCtor();
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
};

export class LivePreviewAudio {
  private readonly ctx: BaseAudioContext | null;
  private readonly master: GainNode | null;
  private readonly nodes = new Map<string, TrackNode>();
  /** Ganancias deseadas por clave: se aplican al cargar y en cada cambio en vivo. */
  private readonly targetGains = new Map<string, number>();
  private loaded = false;
  private loadingPromise: Promise<void> | null = null;
  private playing = false;
  /** Anclaje para medir el tiempo del audio: `ctx.currentTime` y el tiempo de medio al arrancar. */
  private anchor: { ctxStart: number; mediaStart: number } | null = null;

  constructor(factory: AudioContextFactory = defaultFactory) {
    const ctx = factory();
    if (!ctx) {
      this.ctx = null;
      this.master = null;
      return;
    }
    try {
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.ctx = ctx;
    } catch {
      this.ctx = null;
      this.master = null;
    }
  }

  /** ¿Hay motor real (Web Audio disponible)? */
  get enabled(): boolean {
    return this.ctx !== null;
  }

  /** ¿Ya terminó la carga perezosa de las pistas? (para no re-mostrar "cargando" en cada play). */
  get isLoaded(): boolean {
    return this.loaded;
  }

  /** ¿Se cargó al menos una pista con audio decodificado? Si no, el editor cae al audio del <video>. */
  hasBuffers(): boolean {
    for (const node of this.nodes.values()) if (node.buffer) return true;
    return false;
  }

  /**
   * Carga (una vez, perezosa) el audio de cada pista. Best-effort: una pista cuya extracción o
   * decodificación falle queda sin buffer (no suena) pero no rompe el resto. Idempotente: llamadas
   * concurrentes comparten la misma promesa.
   */
  load(keys: string[], fetchBytes: FetchTrackAudio): Promise<void> {
    if (!this.ctx || this.loaded) return Promise.resolve();
    if (this.loadingPromise) return this.loadingPromise;
    const ctx = this.ctx;
    this.loadingPromise = Promise.all(
      keys.map(async (key) => {
        const gain = ctx.createGain();
        gain.gain.value = this.targetGains.get(key) ?? 1;
        if (this.master) gain.connect(this.master);
        const node: TrackNode = { gain, buffer: null, source: null };
        this.nodes.set(key, node);
        try {
          const bytes = await fetchBytes(key);
          if (bytes.byteLength > 0) node.buffer = await ctx.decodeAudioData(bytes.slice(0));
        } catch {
          // best-effort: pista sin buffer, no suena
        }
      }),
    ).then(() => {
      this.loaded = true;
    });
    return this.loadingPromise;
  }

  /** Reanuda el contexto (llamar dentro de un gesto de usuario: política de autoplay). */
  resume(): void {
    const ctx = this.ctx;
    if (!ctx || 'startRendering' in ctx) return; // offline: lo maneja startRendering, no resume
    if ('resume' in ctx && ctx.state === 'suspended') {
      void (ctx as AudioContext).resume().catch(() => undefined);
    }
  }

  /** Fija la ganancia (0..2) de una pista, en vivo (con rampa corta para no dar clicks). */
  setGain(key: string, gain: number): void {
    this.targetGains.set(key, gain);
    const node = this.nodes.get(key);
    if (!node || !this.ctx) return;
    node.gain.gain.setTargetAtTime(gain, this.ctx.currentTime, GAIN_RAMP_SECONDS);
  }

  /** Arranca (o re-arranca) la reproducción desde `fromSeconds`. */
  play(fromSeconds: number): void {
    if (!this.ctx) return;
    this.playing = true;
    this.startSources(fromSeconds);
    this.resume(); // por si el contexto nació suspendido; las fuentes ya están agendadas
  }

  /** Reposiciona el audio (seek). Solo actúa si está sonando; en pausa, el próximo play fija la pos. */
  seek(fromSeconds: number): void {
    if (!this.ctx || !this.playing) return;
    this.startSources(fromSeconds);
  }

  /** Pausa/para: descarta las fuentes (los `AudioBufferSourceNode` son de un solo uso). */
  stop(): void {
    this.playing = false;
    this.anchor = null;
    this.stopSources();
  }

  /** Tiempo de reproducción del audio, en segundos, o `NaN` si no está sonando. */
  audioTime(): number {
    if (!this.ctx || !this.anchor) return Number.NaN;
    return this.ctx.currentTime - this.anchor.ctxStart + this.anchor.mediaStart;
  }

  /** Libera el AudioContext (al desmontar el editor). */
  dispose(): void {
    this.stop();
    this.nodes.clear();
    const ctx = this.ctx;
    if (ctx && 'close' in ctx) void (ctx as AudioContext).close().catch(() => undefined);
  }

  private startSources(fromSeconds: number): void {
    if (!this.ctx) return;
    this.stopSources();
    const ctx = this.ctx;
    this.anchor = { ctxStart: ctx.currentTime, mediaStart: fromSeconds };
    for (const node of this.nodes.values()) {
      if (!node.buffer) continue;
      const offset = Math.max(0, Math.min(fromSeconds, node.buffer.duration));
      if (offset >= node.buffer.duration) continue; // ya pasado el final de esta pista
      const source = ctx.createBufferSource();
      source.buffer = node.buffer;
      source.connect(node.gain);
      source.start(ctx.currentTime, offset);
      node.source = source;
    }
  }

  private stopSources(): void {
    for (const node of this.nodes.values()) {
      if (!node.source) continue;
      try {
        node.source.stop();
      } catch {
        // ya parada
      }
      node.source.disconnect();
      node.source = null;
    }
  }
}
