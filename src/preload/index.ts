import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannel, IpcEvent } from '@shared/ipc';
import type { AppVersionInfo, CaptureApi, GameclipApi } from '@shared/ipc';
import type { CaptureSettings, CaptureStatus } from '@shared/capture';

const capture: CaptureApi = {
  getStatus: () => ipcRenderer.invoke(IpcChannel.CaptureGetStatus),
  getSettings: () => ipcRenderer.invoke(IpcChannel.CaptureGetSettings),
  setSettings: (partial: Partial<CaptureSettings>) =>
    ipcRenderer.invoke(IpcChannel.CaptureSetSettings, partial),
  getEncoders: () => ipcRenderer.invoke(IpcChannel.CaptureGetEncoders),
  startRecording: () => ipcRenderer.invoke(IpcChannel.CaptureStartRecording),
  stopRecording: () => ipcRenderer.invoke(IpcChannel.CaptureStopRecording),
  saveReplay: () => ipcRenderer.invoke(IpcChannel.CaptureSaveReplay),
  onStatusChanged: (listener: (status: CaptureStatus) => void) => {
    const wrapped = (_event: unknown, status: CaptureStatus) => listener(status);
    ipcRenderer.on(IpcEvent.CaptureStatusChanged, wrapped);
    return () => ipcRenderer.removeListener(IpcEvent.CaptureStatusChanged, wrapped);
  },
};

const api: GameclipApi = {
  getAppVersion: (): Promise<AppVersionInfo> => ipcRenderer.invoke(IpcChannel.AppVersion),
  capture,
};

contextBridge.exposeInMainWorld('gameclip', api);
