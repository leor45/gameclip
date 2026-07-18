import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannel, IpcEvent } from '@shared/ipc';
import type {
  AppVersionInfo,
  CaptureApi,
  EditorApi,
  ExporterApi,
  GameclipApi,
  GamesApi,
  LibraryApi,
  OverlayApi,
  OverlayState,
  PerfApi,
  PerfOverlayData,
} from '@shared/ipc';
import type { PerfOverlayConfig } from '@shared/perf';
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
  onSettingsChanged: (listener: (settings: CaptureSettings) => void) => {
    const wrapped = (_event: unknown, settings: CaptureSettings) => listener(settings);
    ipcRenderer.on(IpcEvent.SettingsChanged, wrapped);
    return () => ipcRenderer.removeListener(IpcEvent.SettingsChanged, wrapped);
  },
};

const games: GamesApi = {
  getIndex: () => ipcRenderer.invoke(IpcChannel.GamesGetIndex),
  rescan: () => ipcRenderer.invoke(IpcChannel.GamesRescan),
  suggestName: (executable: string) =>
    ipcRenderer.invoke(IpcChannel.GamesSuggestName, { executable }),
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

const editor: EditorApi = {
  getAudioTracks: (id: number) => ipcRenderer.invoke(IpcChannel.ClipGetAudioTracks, { id }),
  getWaveforms: (id: number) => ipcRenderer.invoke(IpcChannel.ClipGetAudioWaveforms, { id }),
  getTrackAudio: (id: number, trackIndex: number) =>
    ipcRenderer.invoke(IpcChannel.ClipGetTrackAudio, { id, trackIndex }),
  saveAudioEdit: (clipId: number, mutedTracks: string[]) =>
    ipcRenderer.invoke(IpcChannel.ClipSaveAudioEdit, { clipId, mutedTracks }),
  captureFrame: (clipId: number, pngBase64: string) =>
    ipcRenderer.invoke(IpcChannel.ClipCaptureFrame, { clipId, pngBase64 }),
};

const overlay: OverlayApi = {
  onState: (listener: (state: OverlayState) => void) => {
    const wrapped = (_event: unknown, state: OverlayState) => listener(state);
    ipcRenderer.on(IpcEvent.OverlayState, wrapped);
    return () => ipcRenderer.removeListener(IpcEvent.OverlayState, wrapped);
  },
};

const perf: PerfApi = {
  preview: (config: PerfOverlayConfig) =>
    ipcRenderer.invoke(IpcChannel.PerfOverlayPreview, config),
  onData: (listener: (data: PerfOverlayData) => void) => {
    const wrapped = (_event: unknown, data: PerfOverlayData) => listener(data);
    ipcRenderer.on(IpcEvent.PerfOverlayData, wrapped);
    return () => ipcRenderer.removeListener(IpcEvent.PerfOverlayData, wrapped);
  },
  isPawnIoInstalled: () => ipcRenderer.invoke(IpcChannel.PerfPawnIoInstalled),
};

const api: GameclipApi = {
  getAppVersion: (): Promise<AppVersionInfo> => ipcRenderer.invoke(IpcChannel.AppVersion),
  checkForUpdate: () => ipcRenderer.invoke(IpcChannel.AppCheckUpdate),
  capture,
  games,
  library,
  exporter,
  editor,
  overlay,
  perf,
};

contextBridge.exposeInMainWorld('gameclip', api);
