// Contrato IPC entre main y renderer. Todo canal nuevo se declara aquí:
// nombre en IpcChannel y tipos de request/response en IpcContract.

import type {
  AudioAppInfo,
  AudioDeviceInfo,
  CaptureSettings,
  CaptureStatus,
  DisplayInfo,
  EncoderInfo,
} from './capture';
import type { ExportProgress, ExportRequest, ExportResult } from './export';
import type { GameIndex } from './games';
import type { Clip, ClipPatch, ClipsQuery, StorageStats } from './library';
import type { OverlayNotice } from './overlay';
import type { ClipAudioTrack, SaveAudioEditResult, TrackWaveform } from './tracks';

export const IpcChannel = {
  AppVersion: 'app:version',
  AppCheckUpdate: 'app:check-update',
  CaptureGetStatus: 'capture:get-status',
  CaptureGetSettings: 'capture:get-settings',
  CaptureSetSettings: 'capture:set-settings',
  CaptureGetEncoders: 'capture:get-encoders',
  CaptureGetAudioDevices: 'capture:get-audio-devices',
  CaptureGetAudioApps: 'capture:get-audio-apps',
  CapturePickOutputDir: 'capture:pick-output-dir',
  CaptureGetPttAvailable: 'capture:get-ptt-available',
  CaptureGetDisplays: 'capture:get-displays',
  CaptureSwitchGame: 'capture:switch-game',
  CaptureTakeScreenshot: 'capture:take-screenshot',
  CaptureStartRecording: 'capture:start-recording',
  CaptureStopRecording: 'capture:stop-recording',
  CaptureSaveReplay: 'capture:save-replay',
  GamesGetIndex: 'games:get-index',
  GamesRescan: 'games:rescan',
  GamesSuggestName: 'games:suggest-name',
  LibraryList: 'library:list',
  LibraryGet: 'library:get',
  LibraryGames: 'library:games',
  LibraryUpdate: 'library:update',
  LibraryDelete: 'library:delete',
  LibraryOpenFolder: 'library:open-folder',
  LibrarySetMedia: 'library:set-media',
  LibraryGetStorageStats: 'library:get-storage-stats',
  ExportRun: 'export:run',
  ExportCancel: 'export:cancel',
  ExportCopyLast: 'export:copy-last',
  ExportShowLast: 'export:show-last',
  ClipGetAudioTracks: 'clip:get-audio-tracks',
  ClipGetAudioWaveforms: 'clip:get-audio-waveforms',
  ClipGetTrackAudio: 'clip:get-track-audio',
  ClipSaveAudioEdit: 'clip:save-audio-edit',
  ClipCaptureFrame: 'clip:capture-frame',
} as const;

// Eventos push main → renderer (webContents.send).
export const IpcEvent = {
  CaptureStatusChanged: 'capture:status-changed',
  /** Ajustes guardados (por cualquier vía del main): se empujan ya normalizados. */
  SettingsChanged: 'settings:changed',
  LibraryChanged: 'library:changed',
  ExportProgress: 'export:progress',
  OverlayState: 'overlay:state',
} as const;

// Estado que el main empuja a la página del overlay in-game.
export interface OverlayState {
  recording: boolean;
  /** Texto del toast (p. ej. «Clip guardado ✓») o null si no hay. */
  toast: string | null;
  /** Aviso al detectarse un juego (título + hotkeys reales); null cuando no hay ninguno. */
  notice: OverlayNotice | null;
}

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel];

export interface AppVersionInfo {
  version: string;
  electron: string;
}

/** Resultado de comprobar si hay una versión nueva publicada en GitHub. */
export interface UpdateCheckResult {
  /** Versión instalada (app.getVersion()). */
  current: string;
  /** Última versión publicada, sin la 'v'. null si el chequeo falló (offline, rate-limit, etc.). */
  latest: string | null;
  updateAvailable: boolean;
  /** Página del release a la que mandar al usuario; siempre válida aunque el chequeo falle. */
  url: string;
}

// Mapa canal → { request, response }; el preload y el main lo usan para tipar invoke/handle.
export interface IpcContract {
  [IpcChannel.AppVersion]: { request: void; response: AppVersionInfo };
  [IpcChannel.AppCheckUpdate]: { request: void; response: UpdateCheckResult };
  [IpcChannel.CaptureGetStatus]: { request: void; response: CaptureStatus };
  [IpcChannel.CaptureGetSettings]: { request: void; response: CaptureSettings };
  [IpcChannel.CaptureSetSettings]: {
    request: Partial<CaptureSettings>;
    response: CaptureSettings;
  };
  [IpcChannel.CaptureGetEncoders]: { request: void; response: EncoderInfo[] };
  [IpcChannel.CaptureGetAudioDevices]: { request: void; response: AudioDeviceInfo[] };
  [IpcChannel.CaptureGetAudioApps]: { request: void; response: AudioAppInfo[] };
  /** Diálogo nativo de carpeta; null si el usuario cancela. */
  [IpcChannel.CapturePickOutputDir]: { request: void; response: string | null };
  /** false si el hook global de push-to-talk no pudo cargar. */
  [IpcChannel.CaptureGetPttAvailable]: { request: void; response: boolean };
  [IpcChannel.CaptureGetDisplays]: { request: void; response: DisplayInfo[] };
  /** Rota el juego activo entre los juegos en ejecución. */
  [IpcChannel.CaptureSwitchGame]: { request: void; response: CaptureStatus };
  /** Guarda un PNG del monitor de grabación; devuelve la ruta o null si falló. */
  [IpcChannel.CaptureTakeScreenshot]: { request: void; response: string | null };
  [IpcChannel.CaptureStartRecording]: { request: void; response: CaptureStatus };
  [IpcChannel.CaptureStopRecording]: { request: void; response: CaptureStatus };
  [IpcChannel.CaptureSaveReplay]: { request: void; response: CaptureStatus };
  /** Juegos instalados que la app conoce (`pioneergame` → `ARC Raiders`). */
  [IpcChannel.GamesGetIndex]: { request: void; response: GameIndex };
  /** Relee los launchers y re-escanea; devuelve el índice nuevo. */
  [IpcChannel.GamesRescan]: { request: void; response: GameIndex };
  /** Nombre propuesto para un ejecutable al darlo de alta a mano; null si no se deduce nada. */
  [IpcChannel.GamesSuggestName]: { request: { executable: string }; response: string | null };
  [IpcChannel.LibraryList]: { request: ClipsQuery; response: Clip[] };
  [IpcChannel.LibraryGet]: { request: { id: number }; response: Clip | null };
  [IpcChannel.LibraryGames]: { request: void; response: string[] };
  [IpcChannel.LibraryUpdate]: { request: { id: number; patch: ClipPatch }; response: Clip };
  [IpcChannel.LibraryDelete]: { request: { id: number }; response: void };
  [IpcChannel.LibraryOpenFolder]: { request: { id: number }; response: void };
  [IpcChannel.LibrarySetMedia]: {
    request: { id: number; durationSeconds?: number; thumbnailDataUrl?: string };
    response: Clip;
  };
  [IpcChannel.LibraryGetStorageStats]: { request: void; response: StorageStats };
  [IpcChannel.ExportRun]: { request: ExportRequest; response: ExportResult };
  [IpcChannel.ExportCancel]: { request: void; response: void };
  [IpcChannel.ExportCopyLast]: { request: void; response: boolean };
  [IpcChannel.ExportShowLast]: { request: void; response: void };
  /** Pistas de audio del clip, sondeadas del archivo (vacío si no se pudo leer). */
  [IpcChannel.ClipGetAudioTracks]: { request: { id: number }; response: ClipAudioTrack[] };
  /** Ondas (espectros) por pista seleccionable del clip; best-effort (vacío o pistas sin picos). */
  [IpcChannel.ClipGetAudioWaveforms]: { request: { id: number }; response: TrackWaveform[] };
  /** Bytes (AAC/ADTS) de una pista seleccionable, para oírla en vivo; vacío si no se pudo. */
  [IpcChannel.ClipGetTrackAudio]: {
    request: { id: number; trackIndex: number };
    response: ArrayBuffer;
  };
  /** Reescribe la mezcla del clip guardado con las pistas marcadas (no borra pistas). */
  [IpcChannel.ClipSaveAudioEdit]: {
    request: { clipId: number; mutedTracks: string[] };
    response: SaveAudioEditResult;
  };
  /** Guarda un fotograma (PNG en base64) del clip como captura en la biblioteca. */
  [IpcChannel.ClipCaptureFrame]: {
    request: { clipId: number; pngBase64: string };
    response: CaptureFrameResult;
  };
}

/** Resultado de guardar un fotograma como captura. */
export interface CaptureFrameResult {
  ok: boolean;
  /** Mensaje de error (sencillo) cuando `ok` es false. */
  message?: string;
}

export interface CaptureApi {
  getStatus(): Promise<CaptureStatus>;
  getSettings(): Promise<CaptureSettings>;
  setSettings(partial: Partial<CaptureSettings>): Promise<CaptureSettings>;
  getEncoders(): Promise<EncoderInfo[]>;
  getAudioDevices(): Promise<AudioDeviceInfo[]>;
  getAudioApps(): Promise<AudioAppInfo[]>;
  /** Diálogo nativo para elegir la carpeta de clips; null si se cancela. */
  pickOutputDir(): Promise<string | null>;
  /** ¿El hook global de push-to-talk está disponible en esta máquina? */
  getPttAvailable(): Promise<boolean>;
  /** Displays disponibles con preview, para la grabación de escritorio. */
  getDisplays(): Promise<DisplayInfo[]>;
  switchGame(): Promise<CaptureStatus>;
  takeScreenshot(): Promise<string | null>;
  startRecording(): Promise<CaptureStatus>;
  stopRecording(): Promise<CaptureStatus>;
  saveReplay(): Promise<CaptureStatus>;
  /** Suscribe al estado de captura; devuelve la función para desuscribirse. */
  onStatusChanged(listener: (status: CaptureStatus) => void): () => void;
  /** Suscribe a los ajustes guardados; devuelve la función para desuscribirse. */
  onSettingsChanged(listener: (settings: CaptureSettings) => void): () => void;
}

export interface GamesApi {
  /** Juegos instalados que la app encontró en los launchers: `ejecutable → nombre`. */
  getIndex(): Promise<GameIndex>;
  /** Vuelve a leer los launchers (el owner acaba de instalar un juego). */
  rescan(): Promise<GameIndex>;
  /**
   * Nombre que la app propone para un ejecutable al darlo de alta a mano: lo saca del índice, de la
   * lista curada o de los metadatos del propio `.exe`. Null si no logra deducir nada decente.
   */
  suggestName(executable: string): Promise<string | null>;
}

export interface LibraryApi {
  list(query?: ClipsQuery): Promise<Clip[]>;
  get(id: number): Promise<Clip | null>;
  games(): Promise<string[]>;
  update(id: number, patch: ClipPatch): Promise<Clip>;
  remove(id: number): Promise<void>;
  openFolder(id: number): Promise<void>;
  setMedia(
    id: number,
    media: { durationSeconds?: number; thumbnailDataUrl?: string },
  ): Promise<Clip>;
  getStorageStats(): Promise<StorageStats>;
  /** Suscribe a cambios del catálogo; devuelve la función para desuscribirse. */
  onChanged(listener: () => void): () => void;
}

export interface ExporterApi {
  /** Pide destino (diálogo de guardado en el main) y exporta; resuelve al terminar. */
  run(request: ExportRequest): Promise<ExportResult>;
  cancel(): Promise<void>;
  /** Copia el último archivo exportado al portapapeles como archivo. */
  copyLast(): Promise<boolean>;
  /** Muestra el último archivo exportado en el Explorador. */
  showLast(): Promise<void>;
  /** Suscribe al progreso de exportación; devuelve la función para desuscribirse. */
  onProgress(listener: (progress: ExportProgress) => void): () => void;
}

export interface EditorApi {
  /** Pistas de audio del clip, con su nombre embebido. */
  getAudioTracks(id: number): Promise<ClipAudioTrack[]>;
  /** Ondas por pista seleccionable (para el editor avanzado); best-effort. */
  getWaveforms(id: number): Promise<TrackWaveform[]>;
  /**
   * Bytes (AAC/ADTS) de una pista seleccionable, para reconstruir la mezcla en vivo (Fase 2). El
   * `trackIndex` es el ordinal `-map 0:a:N`. Best-effort: `ArrayBuffer` vacío si no se pudo.
   */
  getTrackAudio(id: number, trackIndex: number): Promise<ArrayBuffer>;
  /**
   * Guarda el edit de audio sobre el clip de la biblioteca: su mezcla pasa a llevar solo las
   * pistas marcadas. Las muteadas siguen en el archivo (el edit es reversible).
   */
  saveAudioEdit(clipId: number, mutedTracks: string[]): Promise<SaveAudioEditResult>;
  /**
   * Guarda un fotograma del clip (PNG en base64, ya con el reencuadre aplicado) como captura en la
   * carpeta del juego y lo da de alta en la biblioteca. Best-effort.
   */
  captureFrame(clipId: number, pngBase64: string): Promise<CaptureFrameResult>;
}

export interface OverlayApi {
  /** Suscribe al estado del overlay; devuelve la función para desuscribirse. */
  onState(listener: (state: OverlayState) => void): () => void;
}

// API que el preload expone en window.gameclip.
export interface GameclipApi {
  getAppVersion(): Promise<AppVersionInfo>;
  /** Comprueba si hay una versión nueva publicada. Nunca rechaza: ante un fallo devuelve sin update. */
  checkForUpdate(): Promise<UpdateCheckResult>;
  capture: CaptureApi;
  games: GamesApi;
  library: LibraryApi;
  exporter: ExporterApi;
  editor: EditorApi;
  overlay: OverlayApi;
}
