import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannel } from '@shared/ipc';
import type { AppVersionInfo, GameclipApi } from '@shared/ipc';

const api: GameclipApi = {
  getAppVersion: (): Promise<AppVersionInfo> => ipcRenderer.invoke(IpcChannel.AppVersion),
};

contextBridge.exposeInMainWorld('gameclip', api);
