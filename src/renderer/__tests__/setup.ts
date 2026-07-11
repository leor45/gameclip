import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { DEFAULT_CAPTURE_SETTINGS } from '@shared/capture';

// Sin globals de Vitest, Testing Library no registra su auto-cleanup.
afterEach(() => {
  cleanup();
  window.location.hash = '';
  localStorage.clear();
});

export function crearGameclipMock() {
  return {
    getAppVersion: vi.fn().mockResolvedValue({ version: '0.0.0-test', electron: '29.3.1' }),
    capture: {
      getStatus: vi
        .fn()
        .mockResolvedValue({ state: 'buffering', error: null, lastClipPath: null, detectedGame: null }),
      getSettings: vi.fn().mockResolvedValue({ ...DEFAULT_CAPTURE_SETTINGS }),
      setSettings: vi
        .fn()
        .mockImplementation((partial) =>
          Promise.resolve({ ...DEFAULT_CAPTURE_SETTINGS, ...partial }),
        ),
      getEncoders: vi.fn().mockResolvedValue([
        { id: 'jim_nvenc', name: 'NVIDIA NVENC H.264' },
        { id: 'obs_x264', name: 'x264 (CPU)' },
      ]),
      getAudioDevices: vi.fn().mockResolvedValue([
        { id: 'device-1', name: 'Micrófono (Realtek Audio)' },
        { id: 'device-2', name: 'Auriculares (USB)' },
      ]),
      getAudioApps: vi.fn().mockResolvedValue([
        { executable: 'Discord.exe', windowTitle: 'Discord' },
        { executable: 'Spotify.exe', windowTitle: 'Spotify' },
      ]),
      pickOutputDir: vi.fn().mockResolvedValue(null),
      getPttAvailable: vi.fn().mockResolvedValue(true),
      getDisplays: vi.fn().mockResolvedValue([
        {
          index: 0,
          label: 'Monitor 1',
          width: 2560,
          height: 1440,
          primary: true,
          thumbnailDataUrl: 'data:image/png;base64,AAA=',
        },
        {
          index: 1,
          label: 'Monitor 2',
          width: 1920,
          height: 1080,
          primary: false,
          thumbnailDataUrl: 'data:image/png;base64,BBB=',
        },
      ]),
      switchGame: vi
        .fn()
        .mockResolvedValue({ state: 'buffering', error: null, lastClipPath: null, detectedGame: null }),
      takeScreenshot: vi.fn().mockResolvedValue('C:\\v\\captura.png'),
      startRecording: vi
        .fn()
        .mockResolvedValue({ state: 'recording', error: null, lastClipPath: null, detectedGame: null }),
      stopRecording: vi.fn().mockResolvedValue({
        state: 'buffering',
        error: null,
        lastClipPath: 'C:\\v\\clip.mp4',
        detectedGame: null,
      }),
      saveReplay: vi.fn().mockResolvedValue({
        state: 'buffering',
        error: null,
        lastClipPath: 'C:\\v\\replay.mp4',
        detectedGame: null,
      }),
      onStatusChanged: vi.fn().mockReturnValue(() => undefined),
    },
    library: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      games: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockImplementation((id, patch) => Promise.resolve({ id, ...patch })),
      remove: vi.fn().mockResolvedValue(undefined),
      openFolder: vi.fn().mockResolvedValue(undefined),
      setMedia: vi.fn().mockImplementation((id) => Promise.resolve({ id })),
      getStorageStats: vi.fn().mockResolvedValue({
        clipsBytes: 20 * 1024 ** 3,
        recordingsBytes: 10 * 1024 ** 3,
        driveFreeBytes: 60 * 1024 ** 3,
        driveTotalBytes: 100 * 1024 ** 3,
      }),
      onChanged: vi.fn().mockReturnValue(() => undefined),
    },
    exporter: {
      run: vi
        .fn()
        .mockResolvedValue({ status: 'done', outputPath: 'C:\\v\\recorte.mp4' }),
      cancel: vi.fn().mockResolvedValue(undefined),
      copyLast: vi.fn().mockResolvedValue(true),
      showLast: vi.fn().mockResolvedValue(undefined),
      onProgress: vi.fn().mockReturnValue(() => undefined),
    },
    overlay: {
      onState: vi.fn().mockReturnValue(() => undefined),
    },
  };
}

// El preload no existe en jsdom: se simula la API expuesta en window.gameclip.
Object.defineProperty(window, 'gameclip', {
  writable: true,
  value: crearGameclipMock(),
});
