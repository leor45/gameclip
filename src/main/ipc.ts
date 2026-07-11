import { app, ipcMain, shell } from 'electron';
import { IpcChannel } from '@shared/ipc';
import type { IpcContract } from '@shared/ipc';
import { normalizeCaptureSettings } from '@shared/capture';
import type { ClipsQuery } from '@shared/library';
import type { CaptureManager } from './capture/manager';
import type { LibraryManager } from './library/manager';

export function registerIpcHandlers(
  capture: CaptureManager,
  library: LibraryManager | null,
): void {
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

  // Sin biblioteca (DB no disponible): los invoke fallan con mensaje claro en el renderer.
  if (!library) return;
  const lib = library;
  ipcMain.handle(IpcChannel.LibraryList, (_event, query: unknown) =>
    lib.list(sanitizeQuery(query)),
  );
  ipcMain.handle(IpcChannel.LibraryGames, () => library.games());
  ipcMain.handle(IpcChannel.LibraryUpdate, (_event, req: { id: number; patch: unknown }) =>
    library.updateClip(mustId(req?.id), req?.patch),
  );
  ipcMain.handle(IpcChannel.LibraryDelete, (_event, req: { id: number }) =>
    library.deleteClip(mustId(req?.id)),
  );
  ipcMain.handle(IpcChannel.LibraryOpenFolder, (_event, req: { id: number }) => {
    const clip = library.getClip(mustId(req?.id));
    if (clip) shell.showItemInFolder(clip.filePath);
  });
  ipcMain.handle(
    IpcChannel.LibrarySetMedia,
    (_event, req: { id: number; durationSeconds?: unknown; thumbnailDataUrl?: unknown }) =>
      library.setClipMedia(mustId(req?.id), {
        durationSeconds:
          typeof req?.durationSeconds === 'number' ? req.durationSeconds : undefined,
        thumbnailDataUrl:
          typeof req?.thumbnailDataUrl === 'string' ? req.thumbnailDataUrl : undefined,
      }),
  );
}

// El id viene del renderer: se valida antes de tocar la DB.
function mustId(id: unknown): number {
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
    throw new Error('Id de clip inválido.');
  }
  return id;
}

function sanitizeQuery(query: unknown): ClipsQuery {
  if (typeof query !== 'object' || query === null) return {};
  const raw = query as Record<string, unknown>;
  return {
    search: typeof raw.search === 'string' ? raw.search : undefined,
    favoritesOnly: raw.favoritesOnly === true,
    game: typeof raw.game === 'string' && raw.game ? raw.game : undefined,
  };
}
