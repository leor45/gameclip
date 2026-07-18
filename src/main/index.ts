import { join } from 'node:path';
import { BrowserWindow, app, dialog, globalShortcut, protocol, shell } from 'electron';
import Database from 'better-sqlite3-electron';
import type { CaptureSettings, CaptureStatus } from '@shared/capture';
import { SERVER_PORT } from '@shared/config';
import type { GameNameContext, RunningGameMatch } from '@shared/games';
import type { HotkeyKey } from '@shared/hotkeys';
import { HOTKEY_ACTIONS, hotkeyCollisions, isHotkeyActive } from '@shared/hotkeys';
import { IpcEvent } from '@shared/ipc';
import { buildGameNotice } from '@shared/overlay';
import { startApi, type ApiHandle } from '../../server/api';
import { ffmpegPath } from './paths';
import { loginItemSettings } from './auto-launch';
import { teardown } from './shutdown';
import { entornoReal, limpiarTemporales, registroEnDisco } from './temp-cleanup';
import { CaptureManager } from './capture/manager';
import type { ClipSavedInfo } from './capture/manager';
import type { DisplayInfo } from './capture/obs';
import { GameDetector } from './capture/game-detector';
import { AutoSwitcher } from './capture/auto-switcher';
import { takeAndRegisterScreenshot } from './capture/screenshot-action';
import { PushToTalk } from './capture/push-to-talk';
import { SettingsStore } from './capture/settings-store';
import { ExportManager } from './export/manager';
import { GameIndexService } from './games';
import { suggestGameName } from './games/suggest';
import { ClipsRepository } from './library/clips-repository';
import { openLibraryDatabase } from './library/database';
import { getForegroundWindowTitle } from './library/foreground';
import { LibraryManager } from './library/manager';
import { migrateClipLayout } from './library/migrate-layout';
import { StorageManager } from './library/storage-manager';
import { MEDIA_SCHEME, MEDIA_SCHEME_PRIVILEGES } from './media-protocol';
import { OverlayController } from './overlay';
import { PerfOverlayController } from './perf-overlay';
import { PerfSampler } from './perf-metrics/sampler';
import { createSensorsReader } from './perf-metrics/sensors';
import { createPresentMonReader } from './perf-metrics/presentmon';
import { createElevatedAutoLaunch } from './elevated-launch';
import type { PerfSnapshot } from '@shared/perf';
import { createTray } from './tray';
import type { AppTray } from './tray';
import { registerIpcHandlers } from './ipc';

// El ffmpeg que ya trae osn (ver paths.ts): ffmpeg-static duplicaba 79 MB del mismo binario.
const ffmpegBin = ffmpegPath();

let mainWindow: BrowserWindow | null = null;
let api: ApiHandle | null = null;
let capture: CaptureManager | null = null;
let library: LibraryManager | null = null;
let storage: StorageManager | null = null;
let overlay: OverlayController | null = null;
let perfOverlay: PerfOverlayController | null = null;
let perfSampler: PerfSampler | null = null;
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

/**
 * Juegos instalados en el PC (Steam, Epic, …). Se carga del caché al instante y se refresca en
 * background al arrancar: es lo que hace que un juego se detecte solo, sin darlo de alta a mano.
 */
const gamesIndex = new GameIndexService({
  cachePath: join(app.getPath('userData'), 'games-index.json'),
  log: (msg) => console.log(msg),
});

/** De dónde salen los nombres de los juegos: el índice y lo que el owner haya puesto a mano. */
function gameNames(): GameNameContext {
  return {
    customGames: settingsStore.load().customGames,
    index: gamesIndex.current(),
  };
}

// Una sola instancia viva: la segunda ejecución enfoca la ventana de la primera y se cierra. Sin
// esto, dos copias pelearían por el puerto fijo de la API (EADDRINUSE) y por el mismo encoder.
const primeraInstancia = app.requestSingleInstanceLock();
if (!primeraInstancia) app.quit();
app.on('second-instance', () => showMainWindow());

/**
 * API embebida en el main. Solo empaquetada: en desarrollo la API sigue siendo un proceso aparte
 * (`npm run dev:server`, con recarga en caliente), y si el main también escuchara, el segundo en
 * arrancar chocaría por el puerto.
 *
 * La DB va a `userData` (junto a `library.db`) y no a `server/data/`: el .exe portable se
 * descomprime en una carpeta temporal distinta en cada arranque, así que una DB junto al código se
 * perdería —usuarios y sesión— en cada ejecución.
 */
function setupApi(): void {
  const fallo = (detalle: string): void => {
    console.error('[api] no arrancó:', detalle);
    dialog.showErrorBox(
      'GameClip: la API no pudo arrancar',
      `${detalle}\n\nLa app abre igual, pero no vas a poder iniciar sesión.`,
    );
  };
  try {
    api = startApi({
      driver: Database,
      dbPath: join(app.getPath('userData'), 'auth.db'),
      port: SERVER_PORT,
      onError: (err) =>
        fallo(
          err.code === 'EADDRINUSE'
            ? `El puerto ${SERVER_PORT} ya está ocupado por otro programa.`
            : err.message,
        ),
    });
  } catch (err) {
    fallo(err instanceof Error ? err.message : String(err));
  }
}

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
  ffmpegBin);

  // El aviso se dispara en la TRANSICIÓN sin-juego → juego, no con cada status: el estado se emite
  // en cada cambio del buffer y el aviso reaparecería solo.
  let juegoAnterior: string | null = null;

  manager.on('status', (status: CaptureStatus) => {
    console.log('[capture]', JSON.stringify(status));
    mainWindow?.webContents.send(IpcEvent.CaptureStatusChanged, status);
    overlay?.setRecording(status.state === 'recording');
    tray?.setRecording(status.state === 'recording');
    // Segunda vía de calificación de los FPS: el juego detectado muestra su contador aunque corra
    // en ventana normal (un emulador). Va por el ejecutable, que es lo que PresentMon reporta en su
    // columna `Application`; `detectedGame` es el nombre visible y no serviría para cruzarlo.
    perfSampler?.setDetectedGame(manager.activeGameExecutable());

    if (status.detectedGame && !juegoAnterior) {
      const aviso = buildGameNotice(manager.getSettings());
      if (aviso) overlay?.showNotice(aviso);
    }
    juegoAnterior = status.detectedGame;
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
      gameNames,
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
    // Bajar el límite o activar el auto-borrado desde Ajustes limpia de inmediato. Y si el owner
    // acaba de renombrar un juego, sus clips ya grabados se re-etiquetan con el nombre nuevo.
    manager.on('settings', () => {
      lib.reconcile(manager.outputDir());
      lib.relabelGames(manager.outputDir());
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
  const d = new GameDetector({
    customGames: manager.getSettings().customGames,
    index: gamesIndex.current(), // el del arranque anterior; el refresco lo actualiza enseguida
  });
  d.on('games-changed', (list: RunningGameMatch[]) => {
    console.log('[games] en ejecución:', list.map((g) => g.name).join(', ') || '(ninguno)');
    void manager.setRunningGames(list);
  });
  // Apareció un ejecutable desconocido (posible juego instalado con la app abierta): se reconstruye el
  // índice. Barato por la huella; el detector ya trae throttle para no encadenar re-índices.
  d.on('unknown-executable', () => {
    void refreshGameIndex().catch((err) => console.error('[games] re-índice por novedad falló:', err));
  });
  d.start();
  return d;
}

/**
 * Relee los launchers y propaga el índice nuevo: el detector pasa a reconocer los juegos recién
 * instalados, y la biblioteca re-etiqueta sus clips (una carpeta `acblackflag/` que ahora se sabe
 * que es `Assassin's Creed Black Flag Resynced`). No mueve ficheros: solo la columna `game`.
 */
async function refreshGameIndex(): Promise<Record<string, string>> {
  const index = await gamesIndex.refresh();
  detector?.setIndex(index);
  if (library && capture) {
    const reetiquetados = library.relabelGames(capture.outputDir());
    if (reetiquetados) console.log(`[games] ${reetiquetados} clips re-etiquetados`);
  }
  return index;
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

/**
 * Hotkeys globales de captura, uno por acción del catálogo (`HOTKEY_ACTIONS`). Se re-registran
 * enteros al cambiar los ajustes (globalShortcut no permite editar uno solo). Las acciones inactivas
 * (modo off, capturas o cambio de juego apagados) no registran nada.
 */
function registerHotkeys(manager: CaptureManager): void {
  globalShortcut.unregisterAll();
  const s = manager.getSettings();

  // La UI ya impide guardar atajos duplicados; si aun así llegan (ajustes editados a mano), la
  // segunda acción no se registra: dos acciones no pueden compartir acelerador.
  const enColision = new Set(hotkeyCollisions(s).flatMap((grupo) => grupo.slice(1)));

  const acciones: Record<HotkeyKey, () => void> = {
    replayHotkey: () => void manager.saveReplay(),
    // Un solo atajo para grabar y para parar: lo decide el estado actual.
    recordingHotkey: () => {
      if (manager.getStatus().state === 'recording') void manager.stopRecording();
      else void manager.startRecording();
    },
    screenshotHotkey: () => {
      void takeAndRegisterScreenshot(manager, library).then((path) => {
        if (path) overlay?.showToast('Captura guardada ✓');
      });
    },
    gameSwitchHotkey: () => void manager.switchGame(),
    // Solo alterna la visibilidad; qué se muestra lo deciden los checks de Ajustes.
    perfOverlayHotkey: () => perfOverlay?.toggleVisibility(),
  };

  for (const action of HOTKEY_ACTIONS) {
    if (!isHotkeyActive(action, s) || enColision.has(action.key)) continue;
    const accel = s[action.key].trim();
    if (!accel) continue;
    try {
      globalShortcut.register(accel, acciones[action.key]);
    } catch {
      // acelerador inválido: la acción sigue disponible desde la UI
    }
  }
}

/**
 * Barre los temporales que deja el portable. Corre **al arrancar y al cerrar**: al cerrar recupera el
 * espacio en el acto, y al arrancar es la única red que atrapa un cierre sucio (apagón, cuelgue,
 * kill), que por definición no llegó a ejecutar el `will-quit`.
 *
 * El registro solo entra en el arranque: ahí se anota el staging de esta ejecución —mientras todavía
 * es reconocible— y se borra el que dejó la anterior. En el cierre no hace falta (el arranque ya
 * limpió) y además evita que la app se ponga a borrar cientos de MB justo cuando debería estar
 * saliendo.
 *
 * Solo empaquetada: en dev el "ejecutable" es el electron.exe de node_modules, y el filtro no
 * identificaría a GameClip sino a cualquier temporal de cualquier app de Electron.
 */
function barrerTemporales(registrar = false): void {
  if (!app.isPackaged) return;
  const entorno = entornoReal(app.getPath('temp'), app.getPath('exe'));
  const registro = registrar
    ? registroEnDisco(join(app.getPath('userData'), 'portable-temp.json'))
    : undefined;
  limpiarTemporales(entorno, registro);
}

// En dev registraría electron.exe en el arranque de Windows; solo aplica empaquetada.
function applyAutoLaunch(settings: CaptureSettings): void {
  if (!app.isPackaged) return;
  // Con el auto-inicio elevado activo, el arranque lo hace la tarea programada: la clave Run se
  // retira para no lanzar la app dos veces (una normal y otra como admin).
  const porRunKey = settings.autoLaunch && !settings.autoLaunchElevated;
  app.setLoginItemSettings(loginItemSettings(porRunKey, process.env, process.execPath));
}

/**
 * Alta/baja de la tarea programada elevada, SOLO cuando el ajuste cambia (cada aplicación pide una
 * confirmación UAC; en cada arranque sería un prompt por boot). Si falla o se cancela el UAC, el
 * ajuste vuelve a su estado anterior para no dejar un checkbox fantasma.
 */
let elevadoRevirtiendo = false;

function applyElevatedChange(prev: boolean, next: CaptureSettings): void {
  if (prev === next.autoLaunchElevated) return;
  // El cambio que estamos deshaciendo nosotros no debe intentar tocar la tarea otra vez.
  if (elevadoRevirtiendo) {
    elevadoRevirtiendo = false;
    return;
  }
  if (!app.isPackaged) {
    console.log('[autolaunch] auto-inicio elevado ignorado en dev');
    return;
  }
  const exePath = process.env['PORTABLE_EXECUTABLE_FILE'] ?? process.execPath;
  void createElevatedAutoLaunch()
    .setEnabled(next.autoLaunchElevated, exePath)
    .then((ok) => {
      if (ok) return;
      console.error('[autolaunch] no se pudo aplicar el auto-inicio elevado (¿UAC cancelado?)');
      elevadoRevirtiendo = true;
      void capture?.setSettings({ autoLaunchElevated: prev });
    });
}

app.whenReady().then(() => {
  if (!primeraInstancia) return;
  // Lo primero: si el arranque anterior murió mal (apagón, cuelgue), su staging sigue ahí ocupando
  // cientos de MB y nadie más va a limpiarlo. También deja anotado el de esta ejecución.
  barrerTemporales(true);
  // Antes de la ventana: el renderer llama a /api apenas carga (sesión persistida).
  if (app.isPackaged) setupApi();
  capture = setupCapture();
  const libSetup = setupLibrary(capture);
  library = libSetup?.lib ?? null;
  storage = libSetup?.storage ?? null;
  detector = setupGameDetection(capture);
  overlay = new OverlayController(capture.getSettings().overlayEnabled);
  {
    const s = capture.getSettings();
    // Los avisos se re-elevan tras cada re-elevación del overlay: comparten banda topmost.
    perfOverlay = new PerfOverlayController(s.perfOverlayEnabled, s.perfOverlay, () =>
      overlay?.raise(),
    );
    perfSampler = new PerfSampler({
      sensors: createSensorsReader(),
      presentMon: createPresentMonReader(),
    });
    perfSampler.on('snapshot', (snapshot: PerfSnapshot) => perfOverlay?.setSnapshot(snapshot));
    perfSampler.configure(s.perfOverlayEnabled ? s.perfOverlay.metrics : null);
  }
  tray = createTray({
    onShow: showMainWindow,
    onSaveReplay: () => void capture?.saveReplay(),
    onQuit: () => app.quit(),
  });
  const exporter = new ExportManager(ffmpegBin);
  exporter.on('progress', (progress) =>
    mainWindow?.webContents.send(IpcEvent.ExportProgress, progress),
  );
  registerMediaProtocol();
  registerIpcHandlers(
    capture,
    library,
    exporter,
    storage,
    () => pushToTalk.available,
    {
      index: () => gamesIndex.current(),
      rescan: () => refreshGameIndex(),
      suggestName: (executable) => suggestGameName(executable, gameNames()),
    },
    (config) => perfOverlay?.preview(config),
  );

  // Los launchers, en background: no bloquea la ventana, y hasta que termine la detección funciona
  // con el índice del arranque anterior (o solo con la lista curada, el primerísimo arranque).
  void refreshGameIndex().catch((err) => console.error('[games] el índice falló:', err));

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
  let elevadoAnterior = capture.getSettings().autoLaunchElevated;
  capture.on('settings', (settings: CaptureSettings) => {
    registerHotkeys(capture!);
    detector?.setCustomGames(settings.customGames);
    overlay?.setEnabled(settings.overlayEnabled);
    perfOverlay?.configure(settings.perfOverlayEnabled, settings.perfOverlay);
    perfSampler?.configure(settings.perfOverlayEnabled ? settings.perfOverlay.metrics : null);
    applyAutoLaunch(settings);
    applyElevatedChange(elevadoAnterior, settings);
    elevadoAnterior = settings.autoLaunchElevated;
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
  // El overlay de rendimiento y sus helpers no emiten hacia nadie: se apagan directo.
  perfSampler?.stop();
  perfOverlay?.destroy();
  perfSampler = null;
  perfOverlay = null;
  // El orden lo decide shutdown.ts: primero se apaga lo que emite (la captura emite un `status`
  // final), después se destruye lo que escucha (overlay y bandeja).
  teardown({
    unregisterHotkeys: () => globalShortcut.unregisterAll(),
    pushToTalk,
    clearTimers: () => {
      if (autoSwitchTimer) clearInterval(autoSwitchTimer);
    },
    detector,
    capture,
    overlay,
    tray,
    api,
    limpiarTemporales: () => barrerTemporales(),
  });
  // Sin referencias, un evento tardío no tiene a quién pegarle.
  capture = null;
  overlay = null;
  tray = null;
  detector = null;
  api = null;
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
