import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type {
  AspectRatioMode,
  AudioDeviceInfo,
  AudioMode,
  CaptureProfile,
  CaptureSettings,
  EncoderInfo,
  OutputResolution,
  RecordingQuality,
} from '@shared/capture';
import { AUDIO_APPS_TRACK_MAX, captureProfile, orderedActiveAudioApps } from '@shared/capture';
import { unpackedPath } from '../paths';

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
interface OsnFilter extends OsnSource {
  release(): void;
}
// OJO: OsnInput NO expone `volume` a propósito. El setter `Input.volume` de osn está roto
// (deja la fuente wasapi en silencio digital); el volumen va por FaderFactory.
interface OsnInput extends OsnSource {
  muted: boolean;
  audioMixers: number;
  readonly properties: OsnProperties;
  update(settings: object): void;
  addFilter(filter: OsnFilter): void;
  removeFilter(filter: OsnFilter): void;
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
interface OsnFader {
  deflection: number;
  attach(input: OsnInput): void;
  detach(): void;
  destroy(): void;
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
  FilterFactory: { create(id: string, name: string, settings?: object): OsnFilter };
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
  FaderFactory: { create(type: number): OsnFader };
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

/** Nombre de pista para una app: ejecutable sin ruta ni extensión `.exe` (case-insensitive). */
export function appTrackName(executable: string): string {
  const base = executable.split(/[\\/]/).pop() ?? executable;
  return base.replace(/\.exe$/i, '');
}

/** Reparto de pistas de audio: máscaras `audioMixers` por rol y pistas a crear. */
export interface AudioTrackLayout {
  /** Máscara del micrófono. */
  micMask: number;
  /** Máscara del audio del juego (modo apps). */
  gameMask: number;
  /** Máscara del loopback de escritorio (modo desktop) o del fallback en modo apps. */
  desktopMask: number;
  /** Máscara por app activa, en orden (modo apps + separadas). */
  appMasks: number[];
  /** Pistas a crear e incluir en `recording.mixer`, ordenadas por índice. */
  tracks: { index: number; name: string }[];
  /** OR de los bits de `tracks` → valor de `recording.mixer`. */
  mixer: number;
  /** true solo con el layout por rol (apps + separadas): habilita el remux de nombres. */
  named: boolean;
}

const TRACK_BIT = (index: number): number => 1 << (index - 1);
const MIX_BIT = TRACK_BIT(1); // pista 1 = mezcla completa, en TODA máscara

/**
 * Calcula el reparto de pistas según modo, "pistas separadas" y las apps activas (en orden).
 * La pista 1 SIEMPRE lleva la mezcla completa (los reproductores solo reproducen la primera).
 *
 * - Sin "pistas separadas": todo a la pista 1 (una sola pista).
 * - Modo `desktop` + separadas: pista 1 mezcla, pista 2 mic (comportamiento previo).
 * - Modo `apps` + separadas (layout por rol): pista 1 `default`, 2 `game`, 3 `mic`, y una
 *   por app activa (`<exe sin .exe>`) en las pistas 4/5/6 — tope `AUDIO_APPS_TRACK_MAX`.
 */
export function audioTrackLayout(
  audioMode: AudioMode,
  separateTracks: boolean,
  activeAppExecutables: string[],
): AudioTrackLayout {
  const single = (n: number): AudioTrackLayout => ({
    micMask: MIX_BIT,
    gameMask: MIX_BIT,
    desktopMask: MIX_BIT,
    appMasks: Array.from({ length: n }, () => MIX_BIT),
    tracks: [{ index: 1, name: 'default' }],
    mixer: MIX_BIT,
    named: false,
  });

  if (!separateTracks) return single(activeAppExecutables.length);

  if (audioMode === 'desktop') {
    return {
      micMask: MIX_BIT | TRACK_BIT(2),
      gameMask: MIX_BIT,
      desktopMask: MIX_BIT,
      appMasks: [],
      tracks: [
        { index: 1, name: 'default' },
        { index: 2, name: 'mic' },
      ],
      mixer: MIX_BIT | TRACK_BIT(2),
      named: false,
    };
  }

  // Modo apps + separadas: layout por rol con slots fijos T1/T2/T3 y apps en T4+.
  const apps = activeAppExecutables.slice(0, AUDIO_APPS_TRACK_MAX);
  const tracks = [
    { index: 1, name: 'default' },
    { index: 2, name: 'game' },
    { index: 3, name: 'mic' },
    ...apps.map((exe, i) => ({ index: 4 + i, name: appTrackName(exe) })),
  ];
  const appMasks = apps.map((_, i) => MIX_BIT | TRACK_BIT(4 + i));
  const mixer = tracks.reduce((acc, t) => acc | TRACK_BIT(t.index), 0);
  return {
    micMask: MIX_BIT | TRACK_BIT(3),
    gameMask: MIX_BIT | TRACK_BIT(2),
    desktopMask: MIX_BIT,
    appMasks,
    tracks,
    mixer,
    named: true,
  };
}

/** Qué fuente de vídeo lleva la escena en cada perfil. */
export type VideoSourceKind = 'monitor' | 'game' | 'none';

/** Configuración efectiva del pipeline: lo que se construye de verdad, ya resuelto el perfil. */
export interface EffectiveCapture {
  profile: CaptureProfile;
  video: VideoSourceKind;
  audioMode: AudioMode;
  separateTracks: boolean;
}

/**
 * Resuelve el perfil y los ajustes de audio/vídeo que se aplican de verdad (helper puro).
 *
 * En perfil `game` mandan los ajustes del usuario (audio por app, pistas por rol). En perfil
 * `desktop` el audio es SIEMPRE el del PC entero — el troceado por aplicación es cosa del juego —
 * y las pistas las decide `desktopAudioTracks`. En perfil `none` no hay nada que capturar.
 */
export function effectiveCapture(
  settings: CaptureSettings,
  gameDetected: boolean,
): EffectiveCapture {
  const profile = captureProfile(settings, gameDetected);
  if (profile === 'game') {
    return {
      profile,
      video: 'game',
      audioMode: settings.audioMode,
      separateTracks: settings.separateAudioTracks,
    };
  }
  return {
    profile,
    video: profile === 'desktop' ? 'monitor' : 'none',
    audioMode: 'desktop',
    separateTracks: settings.desktopAudioTracks === 'separate',
  };
}

/** Display objetivo de la captura: tamaño y origen en píxeles físicos del escritorio virtual. */
export interface DisplayInfo {
  width: number;
  height: number;
  x: number;
  y: number;
}

/** Item de la propiedad-lista `monitor_id` del source monitor_capture. */
export interface MonitorIdItem {
  name: string;
  value: string | number;
}

// El nombre de cada item viene como "NOMBRE: WxH @ x,y" (más "(Monitor principal)" a veces).
const MONITOR_ITEM_RE = /(\d+)x(\d+)\s*@\s*(-?\d+),\s*(-?\d+)/;

/**
 * Elige el device id (`monitor_id`) del display objetivo entre los items del source
 * monitor_capture. La key legacy `monitor` (índice) NO sirve: libobs enumera los monitores
 * en otro orden que Electron y esta build solo respeta `monitor_id`. Matching por prioridad:
 * tamaño+posición exactos → posición sola → tamaño inequívoco → 'Auto' (default de libobs).
 */
export function resolveMonitorId(items: MonitorIdItem[], display: DisplayInfo): string {
  const parsed = items.flatMap((item) => {
    const m = MONITOR_ITEM_RE.exec(item.name);
    if (!m || String(item.value) === 'Auto') return [];
    return [
      {
        value: String(item.value),
        width: Number(m[1]),
        height: Number(m[2]),
        x: Number(m[3]),
        y: Number(m[4]),
      },
    ];
  });

  const exact = parsed.find(
    (p) =>
      p.width === display.width &&
      p.height === display.height &&
      p.x === display.x &&
      p.y === display.y,
  );
  if (exact) return exact.value;

  const byPosition = parsed.find((p) => p.x === display.x && p.y === display.y);
  if (byPosition) return byPosition.value;

  const bySize = parsed.filter((p) => p.width === display.width && p.height === display.height);
  if (bySize.length === 1) return bySize[0].value;

  return 'Auto';
}

/**
 * Settings del loopback de escritorio (wasapi_output_capture). `use_device_timing: false`
 * es obligatorio: con el reloj del dispositivo, las salidas HDMI/DP en reposo entregan
 * timestamps atrasados y libobs descarta todo el audio ("audio is lagging ... at max
 * audio buffering"); con false, libobs timestampa con el reloj del OS.
 */
export const DESKTOP_AUDIO_SETTINGS = { use_device_timing: false } as const;

// Fader logarítmico (el del mixer de OBS). El volumen SIEMPRE va por fader: el setter
// `Input.volume` de osn deja la fuente en silencio digital (causa raíz 3 del fix de audio).
const FADER_TYPE_LOG = 2;

/** Posición del fader (0..1) para un volumen de UI en porcentaje (0..100). */
export function faderDeflection(volumePercent: number): number {
  if (!Number.isFinite(volumePercent)) return 1;
  return Math.min(100, Math.max(0, volumePercent)) / 100;
}

// Métodos del monitor_capture: 1 = duplicación DXGI, 2 = Windows Graphics Capture.
const MONITOR_METHOD_WGC = 2;

/**
 * Settings del source de monitor (helper puro, testeable sin libobs).
 * - Siempre método WGC: la duplicación DXGI entrega frames NEGROS sin error en setups
 *   modernos (verificado en máquina real con HAGS activo); WGC captura bien y es la API
 *   vigente desde Win10 1903 (Windows es la plataforma objetivo).
 * - Sin la key legacy `monitor` (índice): esta build la ignora con `monitor_id` presente
 *   y su orden de enumeración no coincide con el de Electron. El monitor va por device id
 *   (`monitor_id`), resuelto aparte porque la propiedad-lista vive en el source ya creado.
 */
export function monitorCaptureSettings(settings: CaptureSettings): Record<string, unknown> {
  return {
    capture_cursor: settings.showMouseCursor,
    method: MONITOR_METHOD_WGC,
  };
}

/**
 * Settings del source game_capture (helper puro, testeable sin libobs).
 *
 * Con el ejecutable detectado se usa el modo `window` (match por ejecutable): engancha también
 * los juegos en ventana / sin bordes, que `any_fullscreen` deja pasar. Sin ejecutable no hay a
 * qué apuntar, así que se cae a `any_fullscreen` (o a `window` vacío si el usuario forzó ventana).
 */
export function gameCaptureSettings(
  settings: CaptureSettings,
  gameExecutable: string | null,
): Record<string, unknown> {
  const s: Record<string, unknown> = {
    capture_mode: gameExecutable || settings.forceWindowCapture ? 'window' : 'any_fullscreen',
    capture_cursor: settings.showMouseCursor,
  };
  if (gameExecutable) {
    s.window = `::${gameExecutable}`;
    s.priority = 2; // 2 = coincidencia por ejecutable
  }
  if (settings.experimentalCapture) s.capture_overlays = true;
  // Convierte HDR → SDR indicando el espacio de color de origen del juego.
  if (settings.hdrCompatibility) s.rgb10a2_space = '2100pq';
  return s;
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
  /** Fuente de video game_capture, re-apuntable al cambiar el juego (modo window). */
  private gameCaptureSource: OsnInput | null = null;
  /** Fuente del micrófono, para push-to-talk (mute sin rebuild). */
  private micSource: OsnInput | null = null;
  private micFilters: OsnFilter[] = [];
  /** Faders de volumen (uno por fuente de audio); se sueltan en el teardown. */
  private faders: OsnFader[] = [];
  /** Reparto de pistas del pipeline vigente (para el remux de nombres tras grabar). */
  private currentLayout: AudioTrackLayout | null = null;
  /** Índices de pista AAC ya registrados en libobs (globales a la sesión, sin release). */
  private readonly audioTracksCreated = new Set<number>();
  private initialized = false;

  init(paths: ObsPaths): void {
    if (this.initialized) return;
    const require = createRequire(__filename);
    const osn = require('@streamlabs/obs-studio-node') as OsnModule;
    // Desempaquetado: desde este directorio libobs lanza obs64.exe, que no puede vivir en el asar.
    const packageDir = unpackedPath(
      dirname(require.resolve('@streamlabs/obs-studio-node/package.json')),
    );

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
    screen: DisplayInfo,
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

    // Escena: UNA sola fuente de vídeo, la que dicte el perfil. Apilar el game capture sobre el
    // monitor dejaba el resultado en manos de que la capa de juego enganchara: si no lo hacía
    // (juego en ventana / sin bordes) se grababa el escritorio entero. Con una sola fuente, el
    // perfil `game` graba solo el juego y el perfil `desktop` solo el monitor.
    const eff = effectiveCapture(settings, gameExecutable !== null);
    const scene = osn.SceneFactory.create('gameclip-scene');
    this.inputs = [];
    const items: OsnSceneItem[] = [];
    if (eff.video === 'monitor') {
      const monitor = osn.InputFactory.create(
        'monitor_capture',
        'gameclip-monitor',
        monitorCaptureSettings(settings),
      );
      // El monitor se elige por device id: la propiedad-lista `monitor_id` solo existe en el
      // source ya creado, así que se resuelve contra el display objetivo y se aplica en update.
      const monitorId = resolveMonitorId(this.monitorIdItems(monitor), screen);
      if (monitorId !== 'Auto') monitor.update({ monitor_id: monitorId });
      this.inputs.push(monitor);
      items.push(scene.add(monitor));
    } else if (eff.video === 'game') {
      const game = osn.InputFactory.create(
        'game_capture',
        'gameclip-game',
        gameCaptureSettings(settings, gameExecutable),
      );
      this.inputs.push(game);
      this.gameCaptureSource = game;
      items.push(scene.add(game));
    }
    // Perfil `none`: escena vacía. El manager no arranca buffer ni grabación, pero las salidas
    // se construyen igual para que un cambio de ajustes/juego solo tenga que reconstruir.
    this.applyBounds(items, sizes);
    this.scene = scene;

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

    const mixer = this.buildAudioSources(osn, settings, eff, gameExecutable, setSource);

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
      for (const filter of this.micFilters) {
        this.micSource?.removeFilter(filter);
        filter.release();
      }
      for (const fader of this.faders) {
        fader.detach();
        fader.destroy();
      }
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
    this.gameCaptureSource = null;
    this.micSource = null;
    this.micFilters = [];
    this.faders = [];
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
   * Crea las fuentes de audio según la config EFECTIVA (perfil ya resuelto), las asigna a canales
   * y a pistas (audioMixers) según el reparto de `audioTrackLayout`, crea las pistas nombradas y
   * devuelve el bitmask `mixer` de las salidas. Guarda el layout para el remux de nombres.
   */
  private buildAudioSources(
    osn: OsnModule,
    settings: CaptureSettings,
    eff: EffectiveCapture,
    gameExecutable: string | null,
    setSource: (src: OsnInput) => void,
  ): number {
    // Las apps solo cuentan en modo apps (perfil de juego): en escritorio se captura el PC entero.
    const activeApps =
      eff.audioMode === 'apps'
        ? orderedActiveAudioApps(settings.audioApps).slice(0, AUDIO_APPS_TRACK_MAX)
        : [];
    const layout = audioTrackLayout(eff.audioMode, eff.separateTracks, activeApps);
    this.currentLayout = layout;

    // Perfil `none`: no hay nada que grabar, así que no se abre ningún dispositivo de audio.
    // Las pistas sí se registran: las salidas necesitan un mixer válido.
    if (eff.profile === 'none') {
      this.createAudioTracks(osn, layout);
      return layout.mixer;
    }

    // Micrófono: siempre existe (silenciado si está desactivado) para poder religarlo sin rebuild.
    const mic = osn.InputFactory.create('wasapi_input_capture', 'gameclip-mic', {
      device_id: settings.micDeviceId || 'default',
    });
    // Con push-to-talk el mic arranca cerrado hasta que el manager reporte la tecla pulsada.
    mic.muted = !settings.micEnabled || settings.pttEnabled;
    this.applyVolume(osn, mic, settings.micVolume);
    mic.audioMixers = layout.micMask;
    this.inputs.push(mic);
    this.micSource = mic;
    setSource(mic);

    if (settings.noiseSuppressionEnabled) {
      try {
        const filtro = osn.FilterFactory.create('noise_suppress_filter', 'gameclip-ruido', {
          method: 'rnnoise',
        });
        mic.addFilter(filtro);
        this.micFilters.push(filtro);
      } catch {
        // filtro no disponible en esta build: el mic sigue sin supresión
      }
    }

    if (eff.audioMode === 'desktop') {
      const desktop = osn.InputFactory.create(
        'wasapi_output_capture',
        'gameclip-audio',
        DESKTOP_AUDIO_SETTINGS,
      );
      this.applyVolume(osn, desktop, settings.desktopAudioVolume);
      desktop.audioMixers = layout.desktopMask;
      this.inputs.push(desktop);
      setSource(desktop);
    } else {
      let requested = 0;
      let added = 0;
      const addProcess = (executable: string | null, vol: number, mask: number): OsnInput | null => {
        requested++;
        const src = this.createProcessCapture(osn, executable, vol);
        if (!src) return null;
        src.audioMixers = mask;
        this.inputs.push(src);
        setSource(src);
        added++;
        return src;
      };
      // Audio del juego (pista 2): la fuente existe aunque no haya juego aún (window vacío no
      // matchea nada) para poder religarla en caliente sin reconstruir el pipeline.
      if (settings.gameAudioEnabled) {
        this.gameAudioSource = addProcess(gameExecutable, settings.gameAudioVolume, layout.gameMask);
      }
      // Apps activas en orden de pista (T4+); volumen desde su entrada en la lista.
      activeApps.forEach((exe, i) => {
        const entry = settings.audioApps.find(
          (a) => a.executable.toLowerCase() === exe.toLowerCase(),
        );
        addProcess(exe, entry?.volume ?? 100, layout.appMasks[i]);
      });
      // Degradar a escritorio clásico SOLO si ninguna captura por proceso funcionó (la build
      // no trae el source): con una parcial, sumar el escritorio duplicaría el audio.
      if (requested > 0 && added === 0) {
        const desktop = osn.InputFactory.create(
          'wasapi_output_capture',
          'gameclip-audio-fallback',
          DESKTOP_AUDIO_SETTINGS,
        );
        desktop.audioMixers = layout.desktopMask;
        this.inputs.push(desktop);
        setSource(desktop);
      }
    }

    this.createAudioTracks(osn, layout);
    return layout.mixer;
  }

  /**
   * Crea cada pista del layout (una sola vez por sesión: las pistas son globales en libobs y no
   * tienen release; re-crearlas en cada rebuild las fugaría). El nombre es best-effort interno;
   * el nombre final del MP4 lo pone el remux post-grabación.
   */
  private createAudioTracks(osn: OsnModule, layout: AudioTrackLayout): void {
    for (const t of layout.tracks) {
      if (this.audioTracksCreated.has(t.index)) continue;
      const track = osn.AudioTrackFactory.create(AUDIO_TRACK_BITRATE, `gameclip-track-${t.index}`);
      osn.AudioTrackFactory.setAtIndex(track, t.index);
      this.audioTracksCreated.add(t.index);
    }
  }

  /** Pistas nombradas del layout vigente, o null si no aplica el remux (no es layout por rol). */
  namedTracks(): { index: number; name: string }[] | null {
    return this.currentLayout?.named ? this.currentLayout.tracks : null;
  }

  /**
   * Volumen de una fuente vía obs_fader. NUNCA usar el setter `Input.volume` de osn:
   * silencia la fuente (verificado en b18 y b3; ver spec del fix de audio).
   */
  private applyVolume(osn: OsnModule, input: OsnInput, volumePercent: number): void {
    const fader = osn.FaderFactory.create(FADER_TYPE_LOG);
    fader.attach(input);
    fader.deflection = faderDeflection(volumePercent);
    this.faders.push(fader);
  }

  /** Religa la fuente de audio del juego a otro ejecutable sin reconstruir el pipeline. */
  updateGameAudioTarget(executable: string | null): void {
    this.gameAudioSource?.update(processCaptureSettings(executable));
  }

  /** Re-apunta el game capture de video (modo window) a otro ejecutable. */
  updateGameCaptureTarget(executable: string | null): void {
    this.gameCaptureSource?.update({
      window: executable ? `::${executable}` : '',
      priority: 2, // 2 = coincidencia por ejecutable
    });
  }

  /** Mutea/abre el micrófono sin reconstruir el pipeline (push-to-talk). */
  setMicMuted(muted: boolean): void {
    if (this.micSource) this.micSource.muted = muted;
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
      this.applyVolume(osn, src, volume);
      return src;
    } catch {
      return null;
    }
  }

  /** Items de la propiedad-lista `monitor_id` del source de monitor (vacío si no existe). */
  private monitorIdItems(source: OsnInput): MonitorIdItem[] {
    return this.findProperty(source.properties, 'monitor_id')?.details?.items ?? [];
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
