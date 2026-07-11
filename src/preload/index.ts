import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannel, IpcEvent } from '@shared/ipc';
import type {
  AppVersionInfo,
  CaptureApi,
  ExporterApi,
  GameclipApi,
  LibraryApi,
  OverlayApi,
  OverlayState,
} from '@shared/ipc';
import type { CaptureSettings, CaptureStatus } from '@shared/capture';
import type { ExportProgress, ExportRequest } from '@shared/export';
import type { ClipPatch, ClipsQuery } from '@shared/library';

const capture: CaptureApi = {
  getStatus: () => ipcRenderer.invoke(IpcChannel.CaptureGetStatus),
  getSettings: () => ipcRenderer.invoke(IpcChannel.CaptureGetSettings),
  setSettings: (partial: Partial<CaptureSettings>) =>
    ipcRenderer.invoke(IpcChannel.CaptureSetSettings, partial),
  getEncoders: () => ipcRenderer.invoke(IpcChannel.CaptureGetEncoders),
  getAudioDevices: () => ipcRenderer.invoke(IpcChannel.CaptureGetAudioDevices),
  getAudioApps: () => ipcRenderer.invoke(IpcChannel.CaptureGetAudioApps),
  pickOutputDir: () => ipcRenderer.invoke(IpcChannel.CapturePickOutputDir),
  getPttAvailable: () => ipcRenderer.invoke(IpcChannel.CaptureGetPttAvailable),
  getDisplays: () => ipcRenderer.invoke(IpcChannel.CaptureGetDisplays),
  switchGame: () => ipcRenderer.invoke(IpcChannel.CaptureSwitchGame),
  takeScreenshot: () => ipcRenderer.invoke(IpcChannel.CaptureTakeScreenshot),
  startRecording: () => ipcRenderer.invoke(IpcChannel.CaptureStartRecording),
  stopRecording: () => ipcRenderer.invoke(IpcChannel.CaptureStopRecording),
  saveReplay: () => ipcRenderer.invoke(IpcChannel.CaptureSaveReplay),
  onStatusChanged: (listener: (status: CaptureStatus) => void) => {
    const wrapped = (_event: unknown, status: CaptureStatus) => listener(status);
    ipcRenderer.on(IpcEvent.CaptureStatusChanged, wrapped);
    return () => ipcRenderer.removeListener(IpcEvent.CaptureStatusChanged, wrapped);
  },
};

const library: LibraryApi = {
  list: (query?: ClipsQuery) => ipcRenderer.invoke(IpcChannel.LibraryList, query ?? {}),
  get: (id: number) => ipcRenderer.invoke(IpcChannel.LibraryGet, { id }),
  games: () => ipcRenderer.invoke(IpcChannel.LibraryGames),
  update: (id: number, patch: ClipPatch) =>
    ipcRenderer.invoke(IpcChannel.LibraryUpdate, { id, patch }),
  remove: (id: number) => ipcRenderer.invoke(IpcChannel.LibraryDelete, { id }),
  openFolder: (id: number) => ipcRenderer.invoke(IpcChannel.LibraryOpenFolder, { id }),
  setMedia: (id: number, media: { durationSeconds?: number; thumbnailDataUrl?: string }) =>
    ipcRenderer.invoke(IpcChannel.LibrarySetMedia, { id, ...media }),
  getStorageStats: () => ipcRenderer.invoke(IpcChannel.LibraryGetStorageStats),
  onChanged: (listener: () => void) => {
    const wrapped = () => listener();
    ipcRenderer.on(IpcEvent.LibraryChanged, wrapped);
    return () => ipcRenderer.removeListener(IpcEvent.LibraryChanged, wrapped);
  },
};

const exporter: ExporterApi = {
  run: (request: ExportRequest) => ipcRenderer.invoke(IpcChannel.ExportRun, request),
  cancel: () => ipcRenderer.invoke(IpcChannel.ExportCancel),
  copyLast: () => ipcRenderer.invoke(IpcChannel.ExportCopyLast),
  showLast: () => ipcRenderer.invoke(IpcChannel.ExportShowLast),
  onProgress: (listener: (progress: ExportProgress) => void) => {
    const wrapped = (_event: unknown, progress: ExportProgress) => listener(progress);
    ipcRenderer.on(IpcEvent.ExportProgress, wrapped);
    return () => ipcRenderer.removeListener(IpcEvent.ExportProgress, wrapped);
  },
};

const overlay: OverlayApi = {
  onState: (listener: (state: OverlayState) => void) => {
    const wrapped = (_event: unknown, state: OverlayState) => listener(state);
    ipcRenderer.on(IpcEvent.OverlayState, wrapped);
    return () => ipcRenderer.removeListener(IpcEvent.OverlayState, wrapped);
  },
};

const api: GameclipApi = {
  getAppVersion: (): Promise<AppVersionInfo> => ipcRenderer.invoke(IpcChannel.AppVersion),
  capture,
  library,
  exporter,
  overlay,
};

contextBridge.exposeInMainWorld('gameclip', api);
