import { join } from 'node:path';
import { BrowserWindow, app, globalShortcut, protocol, shell } from 'electron';
import type { CaptureSettings, CaptureStatus } from '@shared/capture';
import { IpcEvent } from '@shared/ipc';
import ffmpegPath from 'ffmpeg-static';
import { CaptureManager } from './capture/manager';
import type { ClipSavedInfo } from './capture/manager';
import { GameDetector } from './capture/game-detector';
import { PushToTalk } from './capture/push-to-talk';
import { SettingsStore } from './capture/settings-store';
import { ExportManager } from './export/manager';
import { ClipsRepository } from './library/clips-repository';
import { openLibraryDatabase } from './library/database';
import { getForegroundWindowTitle } from './library/foreground';
import { LibraryManager } from './library/manager';
import { StorageManager } from './library/storage-manager';
import { MEDIA_SCHEME, MEDIA_SCHEME_PRIVILEGES } from './media-protocol';
import { OverlayController } from './overlay';
import { createTray } from './tray';
import type { AppTray } from './tray';
import { registerIpcHandlers } from './ipc';

let mainWindow: BrowserWindow | null = null;
let capture: CaptureManager | null = null;
let library: LibraryManager | null = null;
let storage: StorageManager | null = null;
let overlay: OverlayController | null = null;
let tray: AppTray | null = null;
let detector: GameDetector | null = null;
// Cerrar la ventana la oculta a la bandeja; solo 'Salir' (o quit del SO) cierra de verdad.
let quitting = false;

// El scheme de medios necesita privilegios antes de 'ready' (ver media-protocol.ts).
protocol.registerSchemesAsPrivileged([
  { scheme: MEDIA_SCHEME, privileges: MEDIA_SCHEME_PRIVILEGES },
]);

// Store único de ajustes de captura; se lee ya mismo porque la aceleración por hardware
// solo puede desactivarse ANTES de 'ready' (y de crear ventanas).
const settingsStore = new SettingsStore(join(app.getPath('userData'), 'capture-settings.json'));
if (!settingsStore.load().hardwareAcceleration) {
  app.disableHardwareAcceleration();
  console.log('[app] aceleración por hardware desactivada por ajustes');
}
const pushToTalk = new PushToTalk();

function createMainWindow(options: { hidden?: boolean } = {}): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#111318',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!options.hidden) {
    win.on('ready-to-show', () => win.show());
  }
  win.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => {
    mainWindow = null;
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  mainWindow = win;
}

function showMainWindow(): void {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    createMainWindow();
  }
}

function setupCapture(): CaptureManager {
  // screen solo puede usarse tras 'ready'.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { screen } = require('electron') as typeof import('electron');
  const primary = screen.getPrimaryDisplay();
  const manager = new CaptureManager(settingsStore, {
    obsDataPath: join(app.getPath('userData'), 'obs-data'),
    defaultOutputDir: join(app.getPath('videos'), 'GameClip'),
    appVersion: app.getVersion(),
    primaryDisplay: {
      width: primary.size.width * primary.scaleFactor,
      height: primary.size.height * primary.scaleFactor,
    },
  });

  manager.on('status', (status: CaptureStatus) => {
    console.log('[capture]', JSON.stringify(status));
    mainWindow?.webContents.send(IpcEvent.CaptureStatusChanged, status);
    overlay?.setRecording(status.state === 'recording');
    tray?.setRecording(status.state === 'recording');
  });
  manager.on('clip-saved', () => overlay?.showToast('Clip guardado ✓'));

  registerReplayHotkey(manager);
  return manager;
}

// Biblioteca: si la DB no abre (p. ej. faltó el prebuild ABI-Electron), la app sigue sin
// catálogo y el renderer recibe el error al llamar a la API.
function setupLibrary(
  manager: CaptureManager,
): { lib: LibraryManager; storage: StorageManager } | null {
  try {
    const db = openLibraryDatabase(join(app.getPath('userData'), 'library.db'));
    const repo = new ClipsRepository(db);
    const lib = new LibraryManager(repo, {
      thumbnailsDir: join(app.getPath('userData'), 'thumbnails'),
      getForegroundTitle: getForegroundWindowTitle,
    });
    const stor = new StorageManager(lib, { trashItem: (path) => shell.trashItem(path) });

    const aplicarLimite = (protectPath?: string): void => {
      void stor
        .enforceLimit(manager.getSettings(), { protectPath })
        .catch((err) => console.error('[storage] auto-borrado falló:', err));
    };

    manager.on('clip-saved', (info: ClipSavedInfo) => {
      // El límite se aplica después de registrar, para que el clip nuevo cuente y no se borre.
      void lib
        .registerSavedClip(info.filePath, info.source, info.game)
        .then(() => aplicarLimite(info.filePath))
        .catch((err) => console.error('[storage] auto-borrado falló:', err));
    });
    // Bajar el límite o activar el auto-borrado desde Ajustes limpia de inmediato.
    manager.on('settings', () => {
      lib.reconcile(manager.outputDir());
      aplicarLimite();
    });
    lib.on('changed', () => mainWindow?.webContents.send(IpcEvent.LibraryChanged));
    lib.reconcile(manager.outputDir());
    // Diferido: un backlog sobre el límite no debe bloquear el arranque de la ventana.
    setTimeout(() => aplicarLimite(), 5000);
    return { lib, storage: stor };
  } catch (err) {
    console.error('[library] no se pudo abrir el catálogo:', err);
    return null;
  }
}

function setupGameDetection(manager: CaptureManager): GameDetector {
  const d = new GameDetector();
  d.on('game-started', (game: string, executable: string) => {
    console.log('[games] detectado:', game, `(${executable})`);
    void manager.setGameDetected(game, executable);
  });
  d.on('game-stopped', () => {
    console.log('[games] juego cerrado');
    void manager.setGameDetected(null);
  });
  d.start();
  return d;
}

// gameclip-media://clip/<id> y gameclip-media://thumb/<id>: el renderer nunca maneja rutas.
function registerMediaProtocol(): void {
  protocol.registerFileProtocol(MEDIA_SCHEME, (request, callback) => {
    try {
      const url = new URL(request.url);
      const id = Number(url.pathname.replace(/^\//, ''));
      const clip = Number.isInteger(id) && id > 0 ? (library?.getClip(id) ?? null) : null;
      const path =
        url.host === 'clip' ? clip?.filePath : url.host === 'thumb' ? clip?.thumbnailPath : null;
      if (path) callback({ path });
      else callback({ error: -6 }); // net::ERR_FILE_NOT_FOUND
    } catch {
      callback({ error: -6 });
    }
  });
}

function registerReplayHotkey(manager: CaptureManager): void {
  globalShortcut.unregisterAll();
  const hotkey = manager.getSettings().replayHotkey;
  try {
    globalShortcut.register(hotkey, () => {
      void manager.saveReplay();
    });
  } catch {
    // acelerador inválido: el clip se puede guardar igual desde la UI
  }
}

// En dev registraría electron.exe en el arranque de Windows; solo aplica empaquetada.
function applyAutoLaunch(settings: CaptureSettings): void {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: settings.autoLaunch, args: ['--hidden'] });
}

app.whenReady().then(() => {
  capture = setupCapture();
  const libSetup = setupLibrary(capture);
  library = libSetup?.lib ?? null;
  storage = libSetup?.storage ?? null;
  detector = setupGameDetection(capture);
  overlay = new OverlayController(capture.getSettings().overlayEnabled);
  tray = createTray({
    onShow: showMainWindow,
    onSaveReplay: () => void capture?.saveReplay(),
    onQuit: () => app.quit(),
  });
  const exporter = new ExportManager(ffmpegPath ?? 'ffmpeg');
  exporter.on('progress', (progress) =>
    mainWindow?.webContents.send(IpcEvent.ExportProgress, progress),
  );
  registerMediaProtocol();
  registerIpcHandlers(capture, library, exporter, storage, () => pushToTalk.available);

  // Push-to-talk: el hook global reporta el estado de la tecla al manager.
  pushToTalk.on('held', (held: boolean) => capture?.setMicHeld(held));
  {
    const s = capture.getSettings();
    pushToTalk.configure(s.pttEnabled && s.micEnabled, s.pttHotkey);
  }
  applyAutoLaunch(capture.getSettings());
  createMainWindow({ hidden: process.argv.includes('--hidden') });

  // Init de libobs sin bloquear la ventana; el estado llega por evento.
  void capture.initialize().then(() => runSelfTest(capture!));

  // Si cambian los ajustes (p. ej. hotkey, overlay o auto-arranque), se re-aplican.
  capture.on('settings', (settings: CaptureSettings) => {
    registerReplayHotkey(capture!);
    overlay?.setEnabled(settings.overlayEnabled);
    applyAutoLaunch(settings);
    pushToTalk.configure(settings.pttEnabled && settings.micEnabled, settings.pttHotkey);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('before-quit', () => {
  quitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  pushToTalk.stop();
  detector?.stop();
  overlay?.destroy();
  tray?.destroy();
  capture?.shutdown();
});

// Smoke test de captura sin UI: GAMECLIP_SELFTEST=recording graba unos segundos y sale.
async function runSelfTest(manager: CaptureManager): Promise<void> {
  if (process.env['GAMECLIP_SELFTEST'] !== 'recording') return;
  const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
  try {
    console.log('[selftest] iniciando grabación manual…');
    await manager.startRecording();
    await espera(4000);
    const status = await manager.stopRecording();
    console.log('[selftest] resultado:', JSON.stringify(status));
  } catch (err) {
    console.log('[selftest] error:', err);
  } finally {
    app.quit();
  }
}
