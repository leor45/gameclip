import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type {
  AspectRatioMode,
  AudioDeviceInfo,
  CaptureSettings,
  EncoderInfo,
  OutputResolution,
  RecordingQuality,
} from '@shared/capture';

// Valores espejo de los const enum de module.d.ts (esbuild no inlinea const enums de .d.ts).
const VIDEO_FORMAT_NV12 = 2;
const COLOR_SPACE_CS709 = 2;
const RANGE_PARTIAL = 1;
const SCALE_BICUBIC = 2;
const FPS_TYPE_FRACTIONAL = 2;
const VIDEO_CODE_SUCCESS = 0;
const BOUNDS_SCALE_INNER = 2; // EBoundsType.ScaleInner (barras)
const BOUNDS_SCALE_OUTER = 3; // EBoundsType.ScaleOuter (recorte)
const ALIGN_CENTER = 0; // EAlignment.Center
// Bitrate AAC por pista de audio, en kbps.
const AUDIO_TRACK_BITRATE = 160;
// libobs expone MAX_CHANNELS = 64 canales de salida global; sobra para nuestras fuentes.
const MAX_OUTPUT_CHANNELS = 64;

// Tipado mínimo de lo que usamos de obs-studio-node (la superficie real es enorme y any).
interface OsnSource {
  release(): void;
}
interface OsnListProperty {
  name: string;
  details?: { items: { name: string; value: string | number }[] };
  next(): OsnListProperty | null;
}
interface OsnProperties {
  first(): OsnListProperty | null;
  get(name: string): OsnListProperty | null;
  count(): number;
}
interface OsnInput extends OsnSource {
  muted: boolean;
  volume: number;
  audioMixers: number;
  readonly properties: OsnProperties;
  update(settings: object): void;
}
interface OsnSceneItem {
  bounds: { x: number; y: number };
  boundsType: number;
  alignment: number;
  boundsAlignment: number;
}
interface OsnScene {
  source: OsnSource;
  add(input: OsnInput): OsnSceneItem;
  release(): void;
}
interface OsnVideoContext {
  video: Record<string, number>;
  destroy(): void;
}
interface OsnEncoder {
  release(): void;
}
interface OsnAudioTrack {
  bitrate: number;
  name: string;
}
interface OutputSignal {
  type: string;
  signal: string;
  code: number;
  error: string;
}
// AdvancedRecording no lleva audioEncoder: el audio va por pistas (AudioTrackFactory)
// seleccionadas con el bitmask `mixer`.
interface OsnAdvancedRecording {
  path: string;
  format: string;
  fileFormat: string;
  overwrite: boolean;
  noSpace: boolean;
  video: OsnVideoContext;
  videoEncoder: OsnEncoder;
  mixer: number;
  rescaling: boolean;
  useStreamEncoders: boolean;
  signalHandler: (signal: OutputSignal) => void;
  start(): void;
  stop(force?: boolean): void;
  lastFile(): string;
}
interface OsnAdvancedReplayBuffer {
  path: string;
  format: string;
  duration: number;
  usesStream: boolean;
  overwrite: boolean;
  noSpace: boolean;
  video: OsnVideoContext;
  mixer: number;
  recording: OsnAdvancedRecording;
  signalHandler: (signal: OutputSignal) => void;
  start(): void;
  stop(force?: boolean): void;
  save(): void;
  lastFile(): string;
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
  VideoEncoderFactory: {
    types(): string[];
    create(id: string, name: string, settings?: object): OsnEncoder;
  };
  AudioTrackFactory: {
    create(bitrate: number, name: string): OsnAudioTrack;
    setAtIndex(track: OsnAudioTrack, index: number): void;
  };
  AdvancedRecordingFactory: {
    create(): OsnAdvancedRecording;
    destroy(r: OsnAdvancedRecording): void;
  };
  AdvancedReplayBufferFactory: {
    create(): OsnAdvancedReplayBuffer;
    destroy(r: OsnAdvancedReplayBuffer): void;
  };
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

export type EncoderFamily = 'x264' | 'nvenc' | 'amf' | 'qsv';

/** Familia de encoder a partir del id de libobs (determina las keys de rate control). */
export function encoderFamily(encoderId: string): EncoderFamily {
  if (encoderId.includes('x264')) return 'x264';
  if (encoderId.includes('qsv')) return 'qsv';
  if (encoderId.includes('amf')) return 'amf';
  return 'nvenc'; // jim_nvenc, obs_nvenc_*
}

/**
 * Ajustes de rate control por encoder (helper puro, testeable sin libobs).
 * - bitrateMbps > 0: CBR con `bitrate` en kbps (mismas keys en x264 y HW).
 * - bitrateMbps === 0: calidad fija. x264 usa CRF (`crf`); NVENC/AMF/QSV usan CQP (`cqp`).
 */
export function encoderRateControlSettings(
  encoderId: string,
  quality: RecordingQuality,
  bitrateMbps: number,
): Record<string, string | number> {
  if (bitrateMbps > 0) {
    return { rate_control: 'CBR', bitrate: Math.round(bitrateMbps * 1000) };
  }
  if (encoderFamily(encoderId) === 'x264') {
    const crf = quality === 'high' ? 23 : quality === 'higher' ? 18 : 0;
    return { rate_control: 'CRF', crf };
  }
  // 'lossless' en HW: QP 0 (sin pérdida efectiva); CQP 16 sería visiblemente lossy.
  const cqp = quality === 'high' ? 23 : quality === 'higher' ? 20 : 0;
  return { rate_control: 'CQP', cqp };
}

/** Tamaños de lienzo (base) y salida más el modo de bounds del scene item. */
export interface PipelineSizes {
  baseWidth: number;
  baseHeight: number;
  outputWidth: number;
  outputHeight: number;
  /** Bounds del item de monitor/juego: barras (inner), recorte (outer) o ninguno. */
  boundsType: 'inner' | 'outer' | null;
}

const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2);
const width169 = (height: number): number => even((height * 16) / 9);

/**
 * Calcula lienzo y salida según resolución y relación de aspecto (helper puro).
 * - 'game': salida con el ratio del monitor (comportamiento previo).
 * - 'stretch169': salida 16:9 con lienzo = monitor (libobs estira).
 * - 'bars169'/'crop169': lienzo 16:9 y el item con bounds SCALE_INNER/SCALE_OUTER.
 */
export function computePipelineSizes(
  resolution: OutputResolution,
  aspectRatio: AspectRatioMode,
  screen: { width: number; height: number },
): PipelineSizes {
  const capHeight =
    resolution === 'native'
      ? screen.height
      : Math.min(resolution === '1080p' ? 1080 : 720, screen.height);

  if (aspectRatio === 'game') {
    const scaled = resolution !== 'native' && screen.height > capHeight;
    return {
      baseWidth: screen.width,
      baseHeight: screen.height,
      outputWidth: scaled ? even((screen.width * capHeight) / screen.height) : screen.width,
      outputHeight: scaled ? capHeight : screen.height,
      boundsType: null,
    };
  }

  const outputHeight = capHeight;
  const outputWidth = width169(capHeight);

  if (aspectRatio === 'stretch169') {
    return {
      baseWidth: screen.width,
      baseHeight: screen.height,
      outputWidth,
      outputHeight,
      boundsType: null,
    };
  }

  return {
    baseWidth: width169(screen.height),
    baseHeight: screen.height,
    outputWidth,
    outputHeight,
    boundsType: aspectRatio === 'bars169' ? 'inner' : 'outer',
  };
}

/** Settings de wasapi_process_output_capture: match por ejecutable (priority 2). */
function processCaptureSettings(executable: string | null): object {
  // window "titulo:clase:exe"; sin ejecutable no matchea nada (fuente silenciosa a la espera).
  return { window: executable ? `::${executable}` : '', priority: 2 };
}

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
  private recording: OsnAdvancedRecording | null = null;
  private replayBuffer: OsnAdvancedReplayBuffer | null = null;
  private encoders: OsnEncoder[] = [];
  private outputChannels: number[] = [];
  /** Fuente de audio del juego (modo apps), religable en caliente al cambiar el juego. */
  private gameAudioSource: OsnInput | null = null;
  /** Índices de pista AAC ya registrados en libobs (globales a la sesión, sin release). */
  private readonly audioTracksCreated = new Set<number>();
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

  /**
   * Enumera micrófonos reales: crea una fuente wasapi_input_capture temporal, lee la
   * propiedad `device_id` (lista) y mapea sus items. Siempre incluye 'default' primero.
   */
  getAudioDevices(): AudioDeviceInfo[] {
    const osn = this.mustOsn();
    const devices: AudioDeviceInfo[] = [{ id: 'default', name: 'Micrófono por defecto' }];
    let source: OsnInput | null = null;
    try {
      source = osn.InputFactory.create('wasapi_input_capture', 'gameclip-enum-mic');
      const prop = this.findProperty(source.properties, 'device_id');
      for (const item of prop?.details?.items ?? []) {
        const id = String(item.value);
        if (id && id !== 'default') devices.push({ id, name: item.name });
      }
    } catch {
      // enumeración best-effort: sin dispositivos extra, al menos queda 'default'
    } finally {
      source?.release();
    }
    return devices;
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
    gameExecutable: string | null,
  ): void {
    const osn = this.mustOsn();
    this.teardownPipeline();

    // Contexto de video: lienzo y salida según resolución + relación de aspecto.
    const sizes = computePipelineSizes(settings.resolution, settings.aspectRatio, screen);
    const context = osn.VideoFactory.create();
    context.video = {
      fpsNum: settings.fps,
      fpsDen: 1,
      baseWidth: sizes.baseWidth,
      baseHeight: sizes.baseHeight,
      outputWidth: sizes.outputWidth,
      outputHeight: sizes.outputHeight,
      outputFormat: VIDEO_FORMAT_NV12,
      colorspace: COLOR_SPACE_CS709,
      range: RANGE_PARTIAL,
      scaleType: SCALE_BICUBIC,
      fpsType: FPS_TYPE_FRACTIONAL,
    };
    this.context = context;

    // Escena: monitor de fondo y game capture encima (si hay juego fullscreen, gana).
    const scene = osn.SceneFactory.create('gameclip-scene');
    const monitor = osn.InputFactory.create(
      'monitor_capture',
      'gameclip-monitor',
      this.monitorSettings(settings),
    );
    const game = osn.InputFactory.create(
      'game_capture',
      'gameclip-game',
      this.gameSettings(settings, gameExecutable),
    );
    const monitorItem = scene.add(monitor);
    const gameItem = scene.add(game);
    this.applyBounds([monitorItem, gameItem], sizes);
    this.scene = scene;
    this.inputs = [monitor, game];

    // Canal 1 = escena; los canales 2.. quedan para las fuentes de audio.
    osn.Global.setOutputSource(1, scene.source);
    this.outputChannels.push(1);
    let channel = 2;
    const setSource = (src: OsnInput): void => {
      if (channel >= MAX_OUTPUT_CHANNELS) return; // sin canales libres, se ignora la fuente
      osn.Global.setOutputSource(channel, src);
      this.outputChannels.push(channel);
      channel++;
    };

    const mixer = this.buildAudioSources(osn, settings, gameExecutable, setSource);

    // Salidas advanced: comparten encoder de video y las pistas de audio (bitmask mixer).
    const encoderId = this.pickEncoder(settings.encoderId);
    const encSettings = encoderRateControlSettings(
      encoderId,
      settings.quality,
      settings.bitrateMbps,
    );
    const videoEncoder = osn.VideoEncoderFactory.create(encoderId, 'gameclip-venc', encSettings);
    this.encoders = [videoEncoder];

    const recording = osn.AdvancedRecordingFactory.create();
    recording.path = outputDir;
    recording.format = 'mp4';
    recording.video = context;
    recording.videoEncoder = videoEncoder;
    recording.mixer = mixer;
    recording.rescaling = false;
    recording.useStreamEncoders = false;
    recording.overwrite = false;
    recording.noSpace = false;
    recording.signalHandler = (s) => this.emit('signal', s);
    this.recording = recording;

    const replayBuffer = osn.AdvancedReplayBufferFactory.create();
    replayBuffer.path = outputDir;
    replayBuffer.format = 'mp4';
    replayBuffer.duration = settings.replaySeconds;
    replayBuffer.video = context;
    replayBuffer.mixer = mixer;
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
      if (this.replayBuffer) osn.AdvancedReplayBufferFactory.destroy(this.replayBuffer);
      if (this.recording) osn.AdvancedRecordingFactory.destroy(this.recording);
      for (const enc of this.encoders) enc.release();
      for (const channel of this.outputChannels) osn.Global.setOutputSource(channel, null);
      for (const input of this.inputs) input.release();
      this.scene?.release();
      this.context?.destroy();
    } catch {
      // teardown best-effort: no dejar que un release fallido tumbe la app
    }
    this.replayBuffer = null;
    this.recording = null;
    this.encoders = [];
    this.outputChannels = [];
    this.inputs = [];
    this.gameAudioSource = null;
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
    this.audioTracksCreated.clear(); // la próxima sesión de libobs arranca sin pistas
    this.osn = null;
    this.initialized = false;
  }

  /**
   * Crea las fuentes de audio según los ajustes, las asigna a canales y a pistas
   * (audioMixers) y devuelve el bitmask `mixer` de las pistas usadas.
   * Sin separateAudioTracks: todo a la pista 1. Con él: escritorio/juego → 1,
   * micrófono → 2, apps extra → 3.
   */
  private buildAudioSources(
    osn: OsnModule,
    settings: CaptureSettings,
    gameExecutable: string | null,
    setSource: (src: OsnInput) => void,
  ): number {
    const trackMask = (index: number): number => 1 << (index - 1);
    const usedTracks = new Set<number>();
    const desktopTrack = 1;
    const micTrack = settings.separateAudioTracks ? 2 : 1;
    const appsTrack = settings.separateAudioTracks ? 3 : 1;

    // Micrófono: siempre existe (silenciado si está desactivado) para poder religarlo sin rebuild.
    const mic = osn.InputFactory.create('wasapi_input_capture', 'gameclip-mic', {
      device_id: settings.micDeviceId || 'default',
    });
    mic.muted = !settings.micEnabled;
    mic.volume = settings.micVolume / 100;
    mic.audioMixers = trackMask(micTrack);
    usedTracks.add(micTrack);
    this.inputs.push(mic);
    setSource(mic);

    if (settings.audioMode === 'desktop') {
      const desktop = osn.InputFactory.create('wasapi_output_capture', 'gameclip-audio');
      desktop.volume = settings.desktopAudioVolume / 100;
      desktop.audioMixers = trackMask(desktopTrack);
      usedTracks.add(desktopTrack);
      this.inputs.push(desktop);
      setSource(desktop);
    } else {
      let requested = 0;
      let added = 0;
      const addProcess = (executable: string | null, vol: number, track: number): OsnInput | null => {
        requested++;
        const src = this.createProcessCapture(osn, executable, vol);
        if (!src) return null;
        src.audioMixers = trackMask(track);
        usedTracks.add(track);
        this.inputs.push(src);
        setSource(src);
        added++;
        return src;
      };
      // Audio del juego: la fuente existe aunque no haya juego aún (window vacío no matchea
      // nada) para poder religarla en caliente sin reconstruir el pipeline.
      if (settings.gameAudioEnabled) {
        this.gameAudioSource = addProcess(gameExecutable, settings.gameAudioVolume, desktopTrack);
      }
      for (const app of settings.audioApps) {
        addProcess(app.executable, app.volume, appsTrack);
      }
      // Degradar a escritorio clásico SOLO si ninguna captura por proceso funcionó (la build
      // no trae el source): con una parcial, sumar el escritorio duplicaría el audio.
      if (requested > 0 && added === 0) {
        const desktop = osn.InputFactory.create('wasapi_output_capture', 'gameclip-audio-fallback');
        desktop.audioMixers = trackMask(desktopTrack);
        usedTracks.add(desktopTrack);
        this.inputs.push(desktop);
        setSource(desktop);
      }
    }

    // Registrar una pista AAC por índice usado (una sola vez por sesión: las pistas son
    // globales en libobs y no tienen release; re-crearlas en cada rebuild las fugaría).
    let mixer = 0;
    for (const index of [...usedTracks].sort((a, b) => a - b)) {
      if (!this.audioTracksCreated.has(index)) {
        const track = osn.AudioTrackFactory.create(AUDIO_TRACK_BITRATE, `gameclip-track-${index}`);
        osn.AudioTrackFactory.setAtIndex(track, index);
        this.audioTracksCreated.add(index);
      }
      mixer |= trackMask(index);
    }
    return mixer;
  }

  /** Religa la fuente de audio del juego a otro ejecutable sin reconstruir el pipeline. */
  updateGameAudioTarget(executable: string | null): void {
    this.gameAudioSource?.update(processCaptureSettings(executable));
  }

  /** Captura de audio por proceso; null si el source no existe en esta build de osn. */
  private createProcessCapture(
    osn: OsnModule,
    executable: string | null,
    volume: number,
  ): OsnInput | null {
    try {
      const src = osn.InputFactory.create(
        'wasapi_process_output_capture',
        `gameclip-app-${executable ?? 'juego'}`,
        processCaptureSettings(executable),
      );
      src.volume = volume / 100;
      return src;
    } catch {
      return null;
    }
  }

  private monitorSettings(settings: CaptureSettings): Record<string, unknown> {
    const s: Record<string, unknown> = { capture_cursor: settings.showMouseCursor };
    // Método 2 = Windows Graphics Capture (captura ventanas fuera de foco).
    if (settings.advancedWindowCapture) s.method = 2;
    return s;
  }

  private gameSettings(
    settings: CaptureSettings,
    gameExecutable: string | null,
  ): Record<string, unknown> {
    const s: Record<string, unknown> = {
      capture_mode: settings.forceWindowCapture ? 'window' : 'any_fullscreen',
      capture_cursor: settings.showMouseCursor,
    };
    if (settings.forceWindowCapture && gameExecutable) {
      s.window = `::${gameExecutable}`;
      s.priority = 2; // 2 = coincidencia por ejecutable
    }
    if (settings.experimentalCapture) s.capture_overlays = true;
    // Convierte HDR → SDR indicando el espacio de color de origen del juego.
    if (settings.hdrCompatibility) s.rgb10a2_space = '2100pq';
    return s;
  }

  private applyBounds(items: OsnSceneItem[], sizes: PipelineSizes): void {
    if (sizes.boundsType === null) return;
    const bt = sizes.boundsType === 'inner' ? BOUNDS_SCALE_INNER : BOUNDS_SCALE_OUTER;
    for (const item of items) {
      item.bounds = { x: sizes.baseWidth, y: sizes.baseHeight };
      item.boundsType = bt;
      item.alignment = ALIGN_CENTER;
      item.boundsAlignment = ALIGN_CENTER;
    }
  }

  /** Busca una propiedad por nombre recorriendo la lista enlazada (get() como atajo). */
  private findProperty(props: OsnProperties, name: string): OsnListProperty | null {
    try {
      const direct = props.get(name);
      if (direct) return direct;
    } catch {
      // algunas builds no exponen get(); caer a la iteración
    }
    let prop = props.first();
    let guard = props.count() + 1;
    while (prop && guard-- > 0) {
      if (prop.name === name) return prop;
      prop = prop.next();
    }
    return null;
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

  private mustRecording(): OsnAdvancedRecording {
    if (!this.recording) throw new Error('No hay pipeline de grabación construido.');
    return this.recording;
  }

  private mustReplayBuffer(): OsnAdvancedReplayBuffer {
    if (!this.replayBuffer) throw new Error('No hay buffer de repetición construido.');
    return this.replayBuffer;
  }
}
