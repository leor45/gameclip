import { join } from 'node:path';
import { BrowserWindow, screen } from 'electron';
import { IpcEvent } from '@shared/ipc';
import type { OverlayState } from '@shared/ipc';
import type { OverlayNotice } from '@shared/overlay';

const TOAST_MS = 3000;
/** Cuánto queda el aviso del juego antes de irse solo. */
const NOTICE_MS = 6000;
/** Margen para que la página termine su animación de salida antes de ocultar la ventana. */
const EXIT_MS = 400;
const WIDTH = 340;
/** Alto para el caso más grande (aviso con sus dos hotkeys); la ventana es transparente. */
const HEIGHT = 220;
const MARGIN = 16;

/**
 * Overlay in-game: ventana transparente, siempre-encima y click-through en la esquina
 * superior derecha del monitor primario. Solo es visible cuando hay algo que mostrar
 * (grabando o toast); el resto del tiempo queda oculta y no compone nada.
 *
 * Limitación conocida: no se ve sobre juegos en fullscreen exclusivo (haría falta
 * inyección tipo overlay de Discord); cubre borderless y ventana.
 */
export class OverlayController {
  private win: BrowserWindow | null = null;
  private state: OverlayState = { recording: false, toast: null, notice: null };
  private enabled: boolean;
  private toastTimer: NodeJS.Timeout | null = null;
  private noticeTimer: NodeJS.Timeout | null = null;
  private hideTimer: NodeJS.Timeout | null = null;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.sync();
  }

  setRecording(recording: boolean): void {
    if (recording === this.state.recording) return;
    this.state = { ...this.state, recording };
    this.sync();
  }

  showToast(text: string): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.state = { ...this.state, toast: text };
    this.toastTimer = setTimeout(() => {
      this.toastTimer = null;
      this.state = { ...this.state, toast: null };
      this.sync();
    }, TOAST_MS);
    this.sync();
  }

  /**
   * Aviso al detectarse un juego. Se retira solo a los pocos segundos; la animación de salida la
   * hace la página (el main no sabe cuánto dura una transición CSS: manda "quitalo" y listo).
   */
  showNotice(notice: OverlayNotice): void {
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.state = { ...this.state, notice };
    this.noticeTimer = setTimeout(() => {
      this.noticeTimer = null;
      this.state = { ...this.state, notice: null };
      this.sync();
    }, NOTICE_MS);
    this.sync();
  }

  destroy(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.win?.destroy();
    this.win = null;
  }

  private sync(): void {
    const visible =
      this.enabled &&
      (this.state.recording || this.state.toast !== null || this.state.notice !== null);

    if (!visible) {
      const win = this.win;
      if (!win || !win.isVisible()) return;
      // Se manda el estado vacío para que la página anime la salida, y la ventana se oculta un
      // instante después: esconderla ya se comería la animación.
      win.webContents.send(IpcEvent.OverlayState, this.state);
      if (this.hideTimer) clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => {
        this.hideTimer = null;
        win.hide();
      }, EXIT_MS);
      return;
    }

    // Vuelve a haber algo que mostrar antes de que la ventana llegara a ocultarse.
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    const win = this.win ?? this.createWindow();
    win.webContents.send(IpcEvent.OverlayState, this.state);
    if (!win.isVisible()) win.showInactive();
  }

  private createWindow(): BrowserWindow {
    const workArea = screen.getPrimaryDisplay().workArea;
    const win = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      x: workArea.x + workArea.width - WIDTH - MARGIN,
      y: workArea.y + MARGIN,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    // 'screen-saver' queda por encima de ventanas borderless de juegos.
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setIgnoreMouseEvents(true);
    // El estado se reenvía cuando la página termina de cargar (la primera vez llega tarde).
    win.webContents.on('did-finish-load', () => {
      win.webContents.send(IpcEvent.OverlayState, this.state);
    });
    if (process.env['ELECTRON_RENDERER_URL']) {
      void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay.html`);
    } else {
      void win.loadFile(join(__dirname, '../renderer/overlay.html'));
    }
    this.win = win;
    return win;
  }
}
