import { clampTrackGain } from '@shared/tracks';

// Motor de audio en vivo del editor avanzado (Fase 2): reconstruye la mezcla desde las pistas
// desglosadas con la Web Audio API (una pista → GainNode → masterGain → destino), colgada del reloj
// del <video> (mudo). El navegador solo decodifica la mezcla `default`, así que el audio real por
// pista lo extrae el main con ffmpeg y aquí se decodifica a un AudioBuffer por pista.
//
// Sin AudioContext (jsdom en tests, o un entorno raro) el motor es un no-op silencioso: guarda el
// estado y sale, y el editor sigue funcionando sin audio en vivo.

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

export class LivePreviewAudio {
  private readonly ctx: AudioContext | null;
  private readonly master: GainNode | null;
  private readonly nodes = new Map<string, TrackNode>();
  /** Ganancias deseadas por clave: se aplican al cargar y en cada cambio en vivo. */
  private readonly targetGains = new Map<string, number>();
  private loaded = false;
  private loadingPromise: Promise<void> | null = null;
  private playing = false;
  /** Anclaje para medir el tiempo del audio: `ctx.currentTime` y el tiempo de medio al arrancar. */
  private anchor: { ctxStart: number; mediaStart: number } | null = null;

  constructor() {
    const Ctor = resolveAudioContextCtor();
    if (!Ctor) {
      this.ctx = null;
      this.master = null;
      return;
    }
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
      this.master = null;
    }
  }

  /** ¿Hay motor real (Web Audio disponible)? */
  get enabled(): boolean {
    return this.ctx !== null;
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
    void this.ctx.resume().catch(() => undefined);
    this.playing = true;
    this.startSources(fromSeconds);
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
    if (this.ctx) void this.ctx.close().catch(() => undefined);
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
