import { join } from 'node:path';
import { BrowserWindow, app, globalShortcut, protocol, shell } from 'electron';
import type { CaptureSettings, CaptureStatus } from '@shared/capture';
import type { RunningGameMatch } from '@shared/games';
import { IpcEvent } from '@shared/ipc';
import ffmpegPath from 'ffmpeg-static';
import { CaptureManager } from './capture/manager';
import type { ClipSavedInfo } from './capture/manager';
import type { DisplayInfo } from './capture/obs';
import { GameDetector } from './capture/game-detector';
import { AutoSwitcher } from './capture/auto-switcher';
import { takeAndRegisterScreenshot } from './capture/screenshot-action';
import { PushToTalk } from './capture/push-to-talk';
import { SettingsStore } from './capture/settings-store';
import { ExportManager } from './export/manager';
import { ClipsRepository } from './library/clips-repository';
import { openLibraryDatabase } from './library/database';
import { getForegroundWindowTitle } from './library/foreground';
import { LibraryManager } from './library/manager';
import { migrateClipLayout } from './library/migrate-layout';
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
let autoSwitchTimer: NodeJS.Timeout | null = null;
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
  // Tamaño en píxeles físicos + origen nativo: libobs identifica el monitor por device id
  // y sus coordenadas son físicas (nativeOrigin), no DIP.
  const displayInfo = (d: Electron.Display): DisplayInfo => ({
    width: d.size.width * d.scaleFactor,
    height: d.size.height * d.scaleFactor,
    x: d.nativeOrigin.x,
    y: d.nativeOrigin.y,
  });
  const manager = new CaptureManager(settingsStore, {
    obsDataPath: join(app.getPath('userData'), 'obs-data'),
    defaultOutputDir: join(app.getPath('videos'), 'GameClip'),
    appVersion: app.getVersion(),
    primaryDisplay: displayInfo(primary),
    // El display a grabar (índice del ajuste); libobs recibe su tamaño real como lienzo base.
    displayByIndex: (index) => {
      const d = screen.getAllDisplays()[index];
      return d ? displayInfo(d) : null;
    },
  },
  // obs por defecto (ObsCapture); ffmpeg para el remux de nombres de pista.
  undefined,
  ffmpegPath ?? 'ffmpeg');

  manager.on('status', (status: CaptureStatus) => {
    console.log('[capture]', JSON.stringify(status));
    mainWindow?.webContents.send(IpcEvent.CaptureStatusChanged, status);
    overlay?.setRecording(status.state === 'recording');
    tray?.setRecording(status.state === 'recording');
  });
  // Los ajustes guardados se empujan al renderer (el sidebar refleja el límite al instante).
  // Va sobre el evento del manager, no sobre el handler IPC: así notifica cualquier vía de
  // guardado del main, no solo la que viene de la UI.
  manager.on('settings', (settings: CaptureSettings) =>
    mainWindow?.webContents.send(IpcEvent.SettingsChanged, settings),
  );
  manager.on('clip-saved', () => overlay?.showToast('Clip guardado ✓'));

  registerHotkeys(manager);
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

    // Antes del primer escaneo: lo que quedó suelto en la raíz pasa al layout por juego. Después
    // de migrar, el reconcile ve los archivos ya en su sitio y no los da de alta por duplicado.
    const migracion = migrateClipLayout(repo, manager.outputDir());
    if (migracion.movedClips || migracion.movedScreenshots) {
      console.log('[library] layout migrado:', JSON.stringify(migracion));
    }
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
  const d = new GameDetector({ customGames: manager.getSettings().customGames });
  d.on('games-changed', (list: RunningGameMatch[]) => {
    console.log('[games] en ejecución:', list.map((g) => g.name).join(', ') || '(ninguno)');
    void manager.setRunningGames(list);
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

// Hotkeys globales de captura: replay (salvo en modo off), cambio de juego y screenshot.
// Se re-registran enteros al cambiar los ajustes (globalShortcut no permite editar uno solo).
function registerHotkeys(manager: CaptureManager): void {
  globalShortcut.unregisterAll();
  const s = manager.getSettings();
  const usados = new Set<string>();
  const registrar = (accel: string, accion: () => void): void => {
    if (!accel) return;
    // Dos acciones con el mismo acelerador: la segunda fallaría en silencio; mejor avisar.
    const key = accel.toLowerCase();
    if (usados.has(key)) {
      console.warn(`[hotkeys] '${accel}' ya está asignado a otra acción; se ignora el duplicado`);
      return;
    }
    try {
      if (globalShortcut.register(accel, accion)) usados.add(key);
    } catch {
      // acelerador inválido: la acción sigue disponible desde la UI
    }
  };

  // En modo off no hay grabación: el hotkey de replay no se registra.
  if (s.recordingMode !== 'off') {
    registrar(s.replayHotkey, () => void manager.saveReplay());
  }
  if (s.gameSwitchEnabled) {
    registrar(s.gameSwitchHotkey, () => void manager.switchGame());
  }
  if (s.screenshotsEnabled) {
    registrar(s.screenshotHotkey, () => {
      void takeAndRegisterScreenshot(manager, library).then((path) => {
        if (path) overlay?.showToast('Captura guardada ✓');
      });
    });
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

  // Auto-cambio de juego: cada 5 s se compara la ventana en primer plano con los juegos en
  // ejecución; 4 muestras seguidas con otro juego distinto del activo → switchGame(target).
  const autoSwitcher = new AutoSwitcher({
    onSwitch: (name) => void capture?.switchGame(name),
  });
  autoSwitchTimer = setInterval(() => {
    const c = capture;
    if (!c) return;
    const s = c.getSettings();
    if (!(s.autoGameSwitching && s.gameSwitchEnabled)) return;
    const juegos = c.getRunningGames();
    if (juegos.length < 2) return; // sin nada a lo que cambiar, no molestamos a PowerShell
    void getForegroundWindowTitle().then((title) => {
      autoSwitcher.update(juegos, title, c.getStatus().detectedGame);
    });
  }, 5000);

  // Si cambian los ajustes (p. ej. hotkeys, overlay, juegos manuales o auto-arranque), se re-aplican.
  capture.on('settings', (settings: CaptureSettings) => {
    registerHotkeys(capture!);
    detector?.setCustomGames(settings.customGames);
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
  if (autoSwitchTimer) clearInterval(autoSwitchTimer);
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
