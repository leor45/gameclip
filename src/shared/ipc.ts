// Contrato IPC entre main y renderer. Todo canal nuevo se declara aquí:
// nombre en IpcChannel y tipos de request/response en IpcContract.

import type { CaptureSettings, CaptureStatus, EncoderInfo } from './capture';
import type { Clip, ClipPatch, ClipsQuery } from './library';

export const IpcChannel = {
  AppVersion: 'app:version',
  CaptureGetStatus: 'capture:get-status',
  CaptureGetSettings: 'capture:get-settings',
  CaptureSetSettings: 'capture:set-settings',
  CaptureGetEncoders: 'capture:get-encoders',
  CaptureStartRecording: 'capture:start-recording',
  CaptureStopRecording: 'capture:stop-recording',
  CaptureSaveReplay: 'capture:save-replay',
  LibraryList: 'library:list',
  LibraryGames: 'library:games',
  LibraryUpdate: 'library:update',
  LibraryDelete: 'library:delete',
  LibraryOpenFolder: 'library:open-folder',
  LibrarySetMedia: 'library:set-media',
} as const;

// Eventos push main → renderer (webContents.send).
export const IpcEvent = {
  CaptureStatusChanged: 'capture:status-changed',
  LibraryChanged: 'library:changed',
} as const;

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
  [IpcChannel.CaptureStartRecording]: { request: void; response: CaptureStatus };
  [IpcChannel.CaptureStopRecording]: { request: void; response: CaptureStatus };
  [IpcChannel.CaptureSaveReplay]: { request: void; response: CaptureStatus };
  [IpcChannel.LibraryList]: { request: ClipsQuery; response: Clip[] };
  [IpcChannel.LibraryGames]: { request: void; response: string[] };
  [IpcChannel.LibraryUpdate]: { request: { id: number; patch: ClipPatch }; response: Clip };
  [IpcChannel.LibraryDelete]: { request: { id: number }; response: void };
  [IpcChannel.LibraryOpenFolder]: { request: { id: number }; response: void };
  [IpcChannel.LibrarySetMedia]: {
    request: { id: number; durationSeconds?: number; thumbnailDataUrl?: string };
    response: Clip;
  };
}

export interface CaptureApi {
  getStatus(): Promise<CaptureStatus>;
  getSettings(): Promise<CaptureSettings>;
  setSettings(partial: Partial<CaptureSettings>): Promise<CaptureSettings>;
  getEncoders(): Promise<EncoderInfo[]>;
  startRecording(): Promise<CaptureStatus>;
  stopRecording(): Promise<CaptureStatus>;
  saveReplay(): Promise<CaptureStatus>;
  /** Suscribe al estado de captura; devuelve la función para desuscribirse. */
  onStatusChanged(listener: (status: CaptureStatus) => void): () => void;
}

export interface LibraryApi {
  list(query?: ClipsQuery): Promise<Clip[]>;
  games(): Promise<string[]>;
  update(id: number, patch: ClipPatch): Promise<Clip>;
  remove(id: number): Promise<void>;
  openFolder(id: number): Promise<void>;
  setMedia(
    id: number,
    media: { durationSeconds?: number; thumbnailDataUrl?: string },
  ): Promise<Clip>;
  /** Suscribe a cambios del catálogo; devuelve la función para desuscribirse. */
  onChanged(listener: () => void): () => void;
}

// API que el preload expone en window.gameclip.
export interface GameclipApi {
  getAppVersion(): Promise<AppVersionInfo>;
  capture: CaptureApi;
  library: LibraryApi;
}
