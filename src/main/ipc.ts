import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BrowserWindow, app, desktopCapturer, dialog, ipcMain, screen, shell } from 'electron';
import { IpcChannel } from '@shared/ipc';
import type { IpcContract } from '@shared/ipc';
import { normalizeCaptureSettings } from '@shared/capture';
import { normalizeExportRequest, type ExportResult } from '@shared/export';
import type { ClipsQuery } from '@shared/library';
import {
  activeTrackIndexes,
  hasRoleTracks,
  normalizeSaveAudioEditRequest,
  type SaveAudioEditResult,
} from '@shared/tracks';
import { listAudioApps } from './capture/audio-apps';
import { takeAndRegisterScreenshot } from './capture/screenshot-action';
import type { CaptureManager } from './capture/manager';
import type { ExportManager } from './export/manager';
import type { LibraryManager } from './library/manager';
import type { StorageManager } from './library/storage-manager';

export function registerIpcHandlers(
  capture: CaptureManager,
  library: LibraryManager | null,
  exporter: ExportManager | null,
  storage: StorageManager | null = null,
  pttAvailable: () => boolean = () => false,
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
  ipcMain.handle(IpcChannel.CaptureGetAudioDevices, () => capture.getAudioDevices());
  ipcMain.handle(IpcChannel.CaptureGetPttAvailable, () => pttAvailable());
  ipcMain.handle(IpcChannel.CaptureGetDisplays, async () => {
    const displays = screen.getAllDisplays();
    const primaryId = screen.getPrimaryDisplay().id;
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 320, height: 180 },
    });
    return displays.map((d, index) => {
      // display_id de desktopCapturer ↔ id de screen; si no matchea, cae al orden.
      const source = sources.find((s) => Number(s.display_id) === d.id) ?? sources[index];
      return {
        index,
        label: d.label || `Display ${index + 1}`,
        width: d.size.width,
        height: d.size.height,
        primary: d.id === primaryId,
        thumbnailDataUrl: source?.thumbnail.toDataURL() ?? '',
      };
    });
  });
  ipcMain.handle(IpcChannel.CaptureSwitchGame, () => capture.switchGame());
  ipcMain.handle(IpcChannel.CaptureTakeScreenshot, () =>
    takeAndRegisterScreenshot(capture, library),
  );
  ipcMain.handle(IpcChannel.CaptureGetAudioApps, () => listAudioApps());
  ipcMain.handle(IpcChannel.CapturePickOutputDir, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const opciones = {
      title: 'Elegir carpeta de clips',
      defaultPath: capture.outputDir(),
      properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'>,
    };
    const eleccion = win
      ? await dialog.showOpenDialog(win, opciones)
      : await dialog.showOpenDialog(opciones);
    return eleccion.canceled || !eleccion.filePaths[0] ? null : eleccion.filePaths[0];
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
  ipcMain.handle(IpcChannel.LibraryGet, (_event, req: { id: number }) =>
    lib.getClip(mustId(req?.id)),
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

  if (storage) {
    const stor = storage;
    ipcMain.handle(IpcChannel.LibraryGetStorageStats, () => stor.getStats(capture.outputDir()));
  }

  if (!exporter) return;
  let lastExportPath: string | null = null;

  ipcMain.handle(
    IpcChannel.ExportRun,
    async (event, rawRequest: unknown): Promise<ExportResult> => {
      const request = normalizeExportRequest(rawRequest);
      const clip = lib.getClip(request.clipId);
      if (!clip) return { status: 'error', message: 'El clip ya no existe.' };
      if (exporter.isBusy) {
        return { status: 'error', message: 'Ya hay una exportación en curso.' };
      }

      const win = BrowserWindow.fromWebContents(event.sender);
      const defaultName = `${sanitizeFileName(clip.title)} (recorte).${request.format}`;
      const opciones = {
        title: 'Guardar recorte',
        defaultPath: join(app.getPath('videos'), defaultName),
        filters:
          request.format === 'mp4'
            ? [{ name: 'Video MP4', extensions: ['mp4'] }]
            : [{ name: 'GIF animado', extensions: ['gif'] }],
      };
      const eleccion = win
        ? await dialog.showSaveDialog(win, opciones)
        : await dialog.showSaveDialog(opciones);
      if (eleccion.canceled || !eleccion.filePath) return { status: 'canceled' };

      // Las pistas marcadas viajan por nombre: el main sondea el archivo y las traduce a los
      // ordinales (`0:a:N`) que entiende ffmpeg. Sin sondeo (o clip sin audio) no se mapea nada.
      let audioTracks: number[] | undefined;
      if (request.mutedTracks && request.format === 'mp4') {
        const tracks = await exporter.probeTracks(clip.filePath);
        if (tracks.length > 0) audioTracks = activeTrackIndexes(tracks, request.mutedTracks);
      }

      const resultado = await exporter.run({
        inputPath: clip.filePath,
        outputPath: eleccion.filePath,
        startSeconds: request.startSeconds,
        endSeconds: request.endSeconds,
        format: request.format,
        quality: request.quality,
        audioTracks,
      });
      if (resultado.status === 'done' && resultado.outputPath) {
        lastExportPath = resultado.outputPath;
      }
      return resultado;
    },
  );
  const exp = exporter;
  ipcMain.handle(IpcChannel.ClipGetAudioTracks, (_event, req: { id: number }) => {
    const clip = lib.getClip(mustId(req?.id));
    return clip ? exp.probeTracks(clip.filePath) : [];
  });
  ipcMain.handle(
    IpcChannel.ClipSaveAudioEdit,
    async (_event, rawRequest: unknown): Promise<SaveAudioEditResult> => {
      const request = normalizeSaveAudioEditRequest(rawRequest);
      const clip = lib.getClip(request.clipId);
      if (!clip) return { status: 'error', message: 'El clip ya no existe.' };
      if (exp.isBusy) return { status: 'error', message: 'Hay una operación de ffmpeg en curso.' };

      const tracks = await exp.probeTracks(clip.filePath);
      if (!hasRoleTracks(tracks)) {
        return { status: 'error', message: 'Este clip no tiene pistas de audio por rol.' };
      }
      try {
        await exp.saveAudioEdit(
          clip.filePath,
          tracks,
          activeTrackIndexes(tracks, request.mutedTracks),
        );
      } catch (err) {
        return { status: 'error', message: err instanceof Error ? err.message : String(err) };
      }
      lib.setAudioEdit(clip.id, request.mutedTracks);
      return { status: 'done' };
    },
  );

  ipcMain.handle(IpcChannel.ExportCancel, () => exporter.cancel());
  ipcMain.handle(IpcChannel.ExportShowLast, () => {
    if (lastExportPath && existsSync(lastExportPath)) shell.showItemInFolder(lastExportPath);
  });
  ipcMain.handle(IpcChannel.ExportCopyLast, () => copyFileToClipboard(lastExportPath));
}

// Electron no expone CF_HDROP (archivos) en su API de portapapeles: se delega en
// PowerShell, que sí arma la lista de archivos pegable en Explorer/Discord.
function copyFileToClipboard(path: string | null): Promise<boolean> {
  return new Promise((resolve) => {
    if (!path || !existsSync(path)) return resolve(false);
    const escaped = path.replace(/'/g, "''");
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', `Set-Clipboard -LiteralPath '${escaped}'`],
      { timeout: 5000, windowsHide: true },
      (err) => resolve(!err),
    );
  });
}

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]+/g, '_').trim() || 'clip';
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
    withoutGame: raw.withoutGame === true,
  };
}
