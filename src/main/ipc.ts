import { app, ipcMain } from 'electron';
import { IpcChannel } from '@shared/ipc';
import type { IpcContract } from '@shared/ipc';

export function registerIpcHandlers(): void {
  ipcMain.handle(
    IpcChannel.AppVersion,
    (): IpcContract[typeof IpcChannel.AppVersion]['response'] => ({
      version: app.getVersion(),
      electron: process.versions.electron,
    }),
  );
}
