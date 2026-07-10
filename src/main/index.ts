import { join } from 'node:path';
import { BrowserWindow, app, globalShortcut, shell } from 'electron';
import { IpcEvent } from '@shared/ipc';
import { CaptureManager } from './capture/manager';
import { SettingsStore } from './capture/settings-store';
import { registerIpcHandlers } from './ipc';

let mainWindow: BrowserWindow | null = null;
let capture: CaptureManager | null = null;

function createMainWindow(): void {
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

  win.on('ready-to-show', () => win.show());
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

function setupCapture(): CaptureManager {
  // screen solo puede usarse tras 'ready'.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { screen } = require('electron') as typeof import('electron');
  const primary = screen.getPrimaryDisplay();
  const store = new SettingsStore(join(app.getPath('userData'), 'capture-settings.json'));
  const manager = new CaptureManager(store, {
    obsDataPath: join(app.getPath('userData'), 'obs-data'),
    defaultOutputDir: join(app.getPath('videos'), 'GameClip'),
    appVersion: app.getVersion(),
    primaryDisplay: {
      width: primary.size.width * primary.scaleFactor,
      height: primary.size.height * primary.scaleFactor,
    },
  });

  manager.on('status', (status) => {
    console.log('[capture]', JSON.stringify(status));
    mainWindow?.webContents.send(IpcEvent.CaptureStatusChanged, status);
  });

  registerReplayHotkey(manager);
  return manager;
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

app.whenReady().then(() => {
  capture = setupCapture();
  registerIpcHandlers(capture);
  createMainWindow();

  // Init de libobs sin bloquear la ventana; el estado llega por evento.
  void capture.initialize().then(() => runSelfTest(capture!));

  // Si cambian los ajustes (p. ej. el hotkey), se re-registra.
  capture.on('settings', () => registerReplayHotkey(capture!));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
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
