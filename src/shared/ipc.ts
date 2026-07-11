// Contrato IPC entre main y renderer. Todo canal nuevo se declara aquí:
// nombre en IpcChannel y tipos de request/response en IpcContract.

import type {
  AudioAppInfo,
  AudioDeviceInfo,
  CaptureSettings,
  CaptureStatus,
  EncoderInfo,
} from './capture';
import type { ExportProgress, ExportRequest, ExportResult } from './export';
import type { Clip, ClipPatch, ClipsQuery, StorageStats } from './library';

export const IpcChannel = {
  AppVersion: 'app:version',
  CaptureGetStatus: 'capture:get-status',
  CaptureGetSettings: 'capture:get-settings',
  CaptureSetSettings: 'capture:set-settings',
  CaptureGetEncoders: 'capture:get-encoders',
  CaptureGetAudioDevices: 'capture:get-audio-devices',
  CaptureGetAudioApps: 'capture:get-audio-apps',
  CapturePickOutputDir: 'capture:pick-output-dir',
  CaptureStartRecording: 'capture:start-recording',
  CaptureStopRecording: 'capture:stop-recording',
  CaptureSaveReplay: 'capture:save-replay',
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
} as const;

// Eventos push main → renderer (webContents.send).
export const IpcEvent = {
  CaptureStatusChanged: 'capture:status-changed',
  LibraryChanged: 'library:changed',
  ExportProgress: 'export:progress',
  OverlayState: 'overlay:state',
} as const;

// Estado que el main empuja a la página del overlay in-game.
export interface OverlayState {
  recording: boolean;
  /** Texto del toast (p. ej. «Clip guardado ✓») o null si no hay. */
  toast: string | null;
}

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel];

export interface AppVersionInfo {
  version: string;
  electron: string;
}

// Mapa canal → { request, response }; el preload y el main lo usan para tipar invoke/handle.
export interface IpcContract {
  [IpcChannel.AppVersion]: { request: void; response: AppVersionInfo };
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
  [IpcChannel.CaptureStartRecording]: { request: void; response: CaptureStatus };
  [IpcChannel.CaptureStopRecording]: { request: void; response: CaptureStatus };
  [IpcChannel.CaptureSaveReplay]: { request: void; response: CaptureStatus };
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
  startRecording(): Promise<CaptureStatus>;
  stopRecording(): Promise<CaptureStatus>;
  saveReplay(): Promise<CaptureStatus>;
  /** Suscribe al estado de captura; devuelve la función para desuscribirse. */
  onStatusChanged(listener: (status: CaptureStatus) => void): () => void;
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

export interface OverlayApi {
  /** Suscribe al estado del overlay; devuelve la función para desuscribirse. */
  onState(listener: (state: OverlayState) => void): () => void;
}

// API que el preload expone en window.gameclip.
export interface GameclipApi {
  getAppVersion(): Promise<AppVersionInfo>;
  capture: CaptureApi;
  library: LibraryApi;
  exporter: ExporterApi;
  overlay: OverlayApi;
}
