import { app, ipcMain } from 'electron';
import { IpcChannel } from '@shared/ipc';
import type { IpcContract } from '@shared/ipc';
import { normalizeCaptureSettings } from '@shared/capture';
import type { CaptureManager } from './capture/manager';

export function registerIpcHandlers(capture: CaptureManager): void {
  ipcMain.handle(
    IpcChannel.AppVersion,
    (): IpcContract[typeof IpcChannel.AppVersion]['response'] => ({
      version: app.getVersion(),
      electron: process.versions.electron,
    }),
  );

  ipcMain.handle(IpcChannel.CaptureGetStatus, () => capture.getStatus());
  ipcMain.handle(IpcChannel.CaptureGetSettings, () => capture.getSettings());
  ipcMain.handle(IpcChannel.CaptureGetEncoders, () => capture.getEncoders());
  ipcMain.handle(IpcChannel.CaptureSetSettings, (_event, partial: unknown) => {
    // El parcial viene del renderer: se normaliza contra los ajustes actuales.
    const current = capture.getSettings();
    const next = normalizeCaptureSettings({ ...current, ...(partial as object) });
    return capture.setSettings(next);
  });
  ipcMain.handle(IpcChannel.CaptureStartRecording, () => capture.startRecording());
  ipcMain.handle(IpcChannel.CaptureStopRecording, () => capture.stopRecording());
  ipcMain.handle(IpcChannel.CaptureSaveReplay, () => capture.saveReplay());
}
