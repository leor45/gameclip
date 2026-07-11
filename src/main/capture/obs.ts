import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { AudioDeviceInfo, CaptureSettings, EncoderInfo } from '@shared/capture';

// Valores espejo de los const enum de module.d.ts (esbuild no inlinea const enums de .d.ts).
const VIDEO_FORMAT_NV12 = 2;
const COLOR_SPACE_CS709 = 2;
const RANGE_PARTIAL = 1;
const SCALE_BICUBIC = 2;
const FPS_TYPE_FRACTIONAL = 2;
const VIDEO_CODE_SUCCESS = 0;
const QUALITY = { high: 1, higher: 2, lossless: 3 } as const;

// Tipado mínimo de lo que usamos de obs-studio-node (la superficie real es enorme y any).
interface OsnSource {
  release(): void;
}
interface OsnInput extends OsnSource {
  muted: boolean;
}
interface OsnScene {
  source: OsnSource & { release(): void };
  add(input: OsnInput): unknown;
  release(): void;
}
interface OsnVideoContext {
  video: Record<string, number>;
  destroy(): void;
}
interface OsnEncoder {
  release(): void;
}
interface OutputSignal {
  type: string;
  signal: string;
  code: number;
  error: string;
}
interface OsnRecording {
  path: string;
  format: string;
  fileFormat: string;
  overwrite: boolean;
  noSpace: boolean;
  video: OsnVideoContext;
  quality: number;
  lowCPU: boolean;
  videoEncoder: OsnEncoder;
  audioEncoder: OsnEncoder;
  signalHandler: (signal: OutputSignal) => void;
  start(): void;
  stop(force?: boolean): void;
  lastFile(): string;
}
interface OsnReplayBuffer extends Omit<OsnRecording, 'quality' | 'lowCPU'> {
  duration: number;
  usesStream: boolean;
  recording: OsnRecording;
  save(): void;
}

interface OsnModule {
  NodeObs: {
    IPC: { host(pipe: string): number; disconnect(): void };
    SetWorkingDirectory(dir: string): void;
    OBS_API_initAPI(lang: string, dataPath: string, version: string, crash: string): number;
    OBS_service_removeCallback(): void;
  };
  VideoFactory: { create(): OsnVideoContext };
  InputFactory: { create(id: string, name: string, settings?: object): OsnInput };
  SceneFactory: { create(name: string): OsnScene };
  Global: { setOutputSource(channel: number, source: OsnSource | null): void };
  VideoEncoderFactory: { types(): string[]; create(id: string, name: string): OsnEncoder };
  AudioEncoderFactory: { create(id: string, name: string): OsnEncoder };
  SimpleRecordingFactory: { create(): OsnRecording; destroy(r: OsnRecording): void };
  SimpleReplayBufferFactory: { create(): OsnReplayBuffer; destroy(r: OsnReplayBuffer): void };
}

const ENCODER_NAMES: Record<string, string> = {
  obs_x264: 'x264 (CPU)',
  jim_nvenc: 'NVIDIA NVENC H.264',
  jim_hevc_nvenc: 'NVIDIA NVENC HEVC',
  obs_nvenc_h264_tex: 'NVIDIA NVENC H.264',
  obs_nvenc_hevc_tex: 'NVIDIA NVENC HEVC',
  h264_texture_amf: 'AMD AMF H.264',
  h265_texture_amf: 'AMD AMF HEVC',
  obs_qsv11: 'Intel QuickSync H.264',
  obs_qsv11_v2: 'Intel QuickSync H.264',
};
const ENCODER_PREFERENCE = [
  'jim_nvenc',
  'obs_nvenc_h264_tex',
  'h264_texture_amf',
  'obs_qsv11_v2',
  'obs_qsv11',
  'obs_x264',
];

export interface ObsPaths {
  /** Carpeta de datos/config que libobs usa (userData/obs). */
  dataPath: string;
  appVersion: string;
}

/**
 * Wrapper de obs-studio-node: init falible, escena de captura (juego + monitor + audio),
 * grabación manual y buffer de repetición. Emite 'signal' con cada señal de salida.
 */
export class ObsCapture extends EventEmitter {
  private osn: OsnModule | null = null;
  private context: OsnVideoContext | null = null;
  private scene: OsnScene | null = null;
  private inputs: OsnInput[] = [];
  private recording: OsnRecording | null = null;
  private replayBuffer: OsnReplayBuffer | null = null;
  private encoders: OsnEncoder[] = [];
  private initialized = false;

  init(paths: ObsPaths): void {
    if (this.initialized) return;
    const require = createRequire(__filename);
    const osn = require('@streamlabs/obs-studio-node') as OsnModule;
    const packageDir = dirname(require.resolve('@streamlabs/obs-studio-node/package.json'));

    const hostResult = osn.NodeObs.IPC.host(`gameclip-osn-${process.pid}`);
    if (hostResult !== VIDEO_CODE_SUCCESS) {
      throw new Error(`libobs IPC host falló (código ${hostResult}).`);
    }
    osn.NodeObs.SetWorkingDirectory(packageDir);
    const initResult = osn.NodeObs.OBS_API_initAPI(
      'es-ES',
      paths.dataPath,
      paths.appVersion,
      '',
    );
    if (initResult !== VIDEO_CODE_SUCCESS) {
      osn.NodeObs.IPC.disconnect();
      throw new Error(`libobs no pudo inicializar (código ${initResult}).`);
    }
    this.osn = osn;
    this.initialized = true;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  getAvailableEncoders(): EncoderInfo[] {
    const osn = this.mustOsn();
    return osn.VideoEncoderFactory.types()
      .filter((id) => id in ENCODER_NAMES)
      .map((id) => ({ id, name: ENCODER_NAMES[id] }));
  }

  getAudioDevices(): AudioDeviceInfo[] {
    // Enumeración real vía propiedades de wasapi_input_capture (tarea del pipeline).
    return [];
  }

  pickEncoder(preferred: string): string {
    const available = this.getAvailableEncoders().map((e) => e.id);
    if (preferred && available.includes(preferred)) return preferred;
    return ENCODER_PREFERENCE.find((id) => available.includes(id)) ?? 'obs_x264';
  }

  /** (Re)construye contexto, escena, fuentes y salidas según los ajustes. */
  buildPipeline(
    settings: CaptureSettings,
    screen: { width: number; height: number },
    outputDir: string,
  ): void {
    const osn = this.mustOsn();
    this.teardownPipeline();

    // Contexto de video: base = monitor primario; salida según el ajuste.
    const output = this.outputSize(settings, screen);
    const context = osn.VideoFactory.create();
    context.video = {
      fpsNum: settings.fps,
      fpsDen: 1,
      baseWidth: screen.width,
      baseHeight: screen.height,
      outputWidth: output.width,
      outputHeight: output.height,
      outputFormat: VIDEO_FORMAT_NV12,
      colorspace: COLOR_SPACE_CS709,
      range: RANGE_PARTIAL,
      scaleType: SCALE_BICUBIC,
      fpsType: FPS_TYPE_FRACTIONAL,
    };
    this.context = context;

    // Escena: monitor de fondo y game capture encima (si hay juego fullscreen, gana).
    const scene = osn.SceneFactory.create('gameclip-scene');
    const monitor = osn.InputFactory.create('monitor_capture', 'gameclip-monitor');
    const game = osn.InputFactory.create('game_capture', 'gameclip-game', {
      capture_mode: 'any_fullscreen',
    });
    scene.add(monitor);
    scene.add(game);
    this.scene = scene;
    this.inputs = [monitor, game];

    const desktopAudio = osn.InputFactory.create('wasapi_output_capture', 'gameclip-audio');
    this.inputs.push(desktopAudio);
    const mic = osn.InputFactory.create('wasapi_input_capture', 'gameclip-mic');
    mic.muted = !settings.micEnabled;
    this.inputs.push(mic);

    osn.Global.setOutputSource(1, scene.source);
    osn.Global.setOutputSource(2, desktopAudio);
    osn.Global.setOutputSource(3, mic);

    // Salidas: una grabación configurada compartida por la grabación manual y el buffer.
    const encoderId = this.pickEncoder(settings.encoderId);
    const videoEncoder = osn.VideoEncoderFactory.create(encoderId, 'gameclip-venc');
    const audioEncoder = osn.AudioEncoderFactory.create('ffmpeg_aac', 'gameclip-aenc');
    this.encoders = [videoEncoder, audioEncoder];

    const recording = osn.SimpleRecordingFactory.create();
    recording.path = outputDir;
    recording.format = 'mp4';
    recording.quality = QUALITY[settings.quality];
    recording.video = context;
    recording.videoEncoder = videoEncoder;
    recording.audioEncoder = audioEncoder;
    recording.lowCPU = false;
    recording.overwrite = false;
    recording.noSpace = false;
    recording.signalHandler = (s) => this.emit('signal', s);
    this.recording = recording;

    const replayBuffer = osn.SimpleReplayBufferFactory.create();
    replayBuffer.path = outputDir;
    replayBuffer.format = 'mp4';
    replayBuffer.duration = settings.replaySeconds;
    replayBuffer.video = context;
    replayBuffer.usesStream = false;
    replayBuffer.overwrite = false;
    replayBuffer.noSpace = false;
    replayBuffer.recording = recording;
    replayBuffer.signalHandler = (s) => this.emit('signal', s);
    this.replayBuffer = replayBuffer;
  }

  startReplayBuffer(): Promise<void> {
    const rb = this.mustReplayBuffer();
    const done = this.waitForSignal('replay-buffer', ['start'], ['stop']);
    rb.start();
    return done.then(() => undefined);
  }

  stopReplayBuffer(): Promise<void> {
    const rb = this.mustReplayBuffer();
    const done = this.waitForSignal('replay-buffer', ['stop'], []);
    rb.stop();
    return done.then(() => undefined);
  }

  async saveReplay(): Promise<string> {
    const rb = this.mustReplayBuffer();
    const wrote = this.waitForSignal('replay-buffer', ['wrote'], ['writing_error']);
    rb.save();
    await wrote;
    return rb.lastFile();
  }

  startRecording(): Promise<void> {
    const rec = this.mustRecording();
    const done = this.waitForSignal('recording', ['start'], ['stop']);
    rec.start();
    return done.then(() => undefined);
  }

  async stopRecording(): Promise<string> {
    const rec = this.mustRecording();
    const done = this.waitForSignal('recording', ['wrote', 'stop'], ['writing_error']);
    rec.stop();
    await done;
    return rec.lastFile();
  }

  teardownPipeline(): void {
    const osn = this.osn;
    if (!osn) return;
    try {
      if (this.replayBuffer) osn.SimpleReplayBufferFactory.destroy(this.replayBuffer);
      if (this.recording) osn.SimpleRecordingFactory.destroy(this.recording);
      for (const enc of this.encoders) enc.release();
      for (const channel of [1, 2, 3]) osn.Global.setOutputSource(channel, null);
      for (const input of this.inputs) input.release();
      this.scene?.release();
      this.context?.destroy();
    } catch {
      // teardown best-effort: no dejar que un release fallido tumbe la app
    }
    this.replayBuffer = null;
    this.recording = null;
    this.encoders = [];
    this.inputs = [];
    this.scene = null;
    this.context = null;
  }

  shutdown(): void {
    if (!this.osn) return;
    this.teardownPipeline();
    try {
      this.osn.NodeObs.OBS_service_removeCallback();
      this.osn.NodeObs.IPC.disconnect();
    } catch {
      // el proceso obs64 se cierra igual al morir el pipe
    }
    this.osn = null;
    this.initialized = false;
  }

  private outputSize(
    settings: CaptureSettings,
    screen: { width: number; height: number },
  ): { width: number; height: number } {
    if (settings.resolution === 'native') return screen;
    const targetHeight = settings.resolution === '1080p' ? 1080 : 720;
    if (screen.height <= targetHeight) return screen;
    const width = Math.round((screen.width * targetHeight) / screen.height / 2) * 2;
    return { width, height: targetHeight };
  }

  private waitForSignal(
    type: string,
    okSignals: string[],
    failSignals: string[],
    timeoutMs = 15000,
  ): Promise<OutputSignal> {
    return new Promise((resolve, reject) => {
      const onSignal = (s: OutputSignal) => {
        if (s.type !== type) return;
        if (okSignals.includes(s.signal) && s.code === 0) {
          cleanup();
          resolve(s);
        } else if (failSignals.includes(s.signal) || s.code !== 0) {
          cleanup();
          reject(new Error(s.error || `libobs: señal ${s.signal} con código ${s.code}`));
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`libobs: timeout esperando señal '${okSignals.join('/')}' de ${type}`));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.off('signal', onSignal);
      };
      this.on('signal', onSignal);
    });
  }

  private mustOsn(): OsnModule {
    if (!this.osn) throw new Error('libobs no está inicializado.');
    return this.osn;
  }

  private mustRecording(): OsnRecording {
    if (!this.recording) throw new Error('No hay pipeline de grabación construido.');
    return this.recording;
  }

  private mustReplayBuffer(): OsnReplayBuffer {
    if (!this.replayBuffer) throw new Error('No hay buffer de repetición construido.');
    return this.replayBuffer;
  }
}
