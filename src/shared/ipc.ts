// Contrato IPC entre main y renderer. Todo canal nuevo se declara aquí:
// nombre en IpcChannel y tipos de request/response en IpcContract.

import type { CaptureSettings, CaptureStatus, EncoderInfo } from './capture';

export const IpcChannel = {
  AppVersion: 'app:version',
  CaptureGetStatus: 'capture:get-status',
  CaptureGetSettings: 'capture:get-settings',
  CaptureSetSettings: 'capture:set-settings',
  CaptureGetEncoders: 'capture:get-encoders',
  CaptureStartRecording: 'capture:start-recording',
  CaptureStopRecording: 'capture:stop-recording',
  CaptureSaveReplay: 'capture:save-replay',
} as const;

// Eventos push main → renderer (webContents.send).
export const IpcEvent = {
  CaptureStatusChanged: 'capture:status-changed',
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

// API que el preload expone en window.gameclip.
export interface GameclipApi {
  getAppVersion(): Promise<AppVersionInfo>;
  capture: CaptureApi;
}
