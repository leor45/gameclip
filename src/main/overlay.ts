import { join } from 'node:path';
import { BrowserWindow, screen } from 'electron';
import { IpcEvent } from '@shared/ipc';
import type { OverlayState } from '@shared/ipc';
import { overlayStateFor } from '@shared/overlay';
import type { OverlayNotice, OverlayZone } from '@shared/overlay';

const TOAST_MS = 3000;
/** Cuánto queda el aviso del juego antes de irse solo. */
const NOTICE_MS = 6000;
/** Margen para que la página termine su animación de salida antes de ocultar la ventana. */
const EXIT_MS = 400;
const MARGIN = 16;

/** Dos esquinas, dos ventanas: los avisos a la izquierda, el REC a la derecha. */
type Zona = OverlayZone;

const TAMANO: Record<Zona, { width: number; height: number }> = {
  // Alto para el caso más grande (el aviso con sus dos hotkeys); la ventana es transparente.
  left: { width: 340, height: 220 },
  right: { width: 160, height: 60 },
};

interface Ventana {
  win: BrowserWindow;
  hideTimer: NodeJS.Timeout | null;
}

/**
 * Overlay in-game: ventanas transparentes, siempre-encima y click-through en las esquinas superiores
 * del monitor primario. Solo son visibles cuando hay algo que mostrar; el resto del tiempo quedan
 * ocultas y no componen nada.
 *
 * Son dos porque las esquinas son dos: el aviso del juego y el toast de clip guardado van arriba a
 * la izquierda, y el indicador REC arriba a la derecha. Cada ventana recibe **el estado filtrado**
 * con lo suyo, así la página sigue siendo una vista tonta que pinta lo que le llega.
 *
 * Limitación conocida: no se ven sobre juegos en fullscreen exclusivo (haría falta inyección tipo
 * overlay de Discord); cubren borderless y ventana.
 */
export class OverlayController {
  private ventanas = new Map<Zona, Ventana>();
  private state: OverlayState = { recording: false, toast: null, notice: null };
  private enabled: boolean;
  private toastTimer: NodeJS.Timeout | null = null;
  private noticeTimer: NodeJS.Timeout | null = null;

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

  /**
   * Re-eleva las ventanas visibles. Lo llama el overlay de rendimiento después de re-elevarse él:
   * los dos son topmost, así que dentro de esa banda el último en subir gana, y estos avisos tienen
   * que quedar siempre por encima.
   */
  raise(): void {
    for (const ventana of this.ventanas.values()) {
      if (ventana.win.isVisible()) ventana.win.moveTop();
    }
  }

  destroy(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    for (const ventana of this.ventanas.values()) {
      if (ventana.hideTimer) clearTimeout(ventana.hideTimer);
      ventana.win.destroy();
    }
    this.ventanas.clear();
  }

  /** Lo que le toca a cada esquina; el resto va en null para que la página no lo pinte. */
  private estadoDe(zona: Zona): OverlayState {
    return overlayStateFor(zona, this.state);
  }

  private sync(): void {
    for (const zona of ['left', 'right'] as Zona[]) {
      this.syncZona(zona, this.estadoDe(zona));
    }
  }

  private syncZona(zona: Zona, state: OverlayState): void {
    const visible =
      this.enabled && (state.recording || state.toast !== null || state.notice !== null);

    if (!visible) {
      const ventana = this.ventanas.get(zona);
      if (!ventana || !ventana.win.isVisible()) return;
      // Se manda el estado vacío para que la página anime la salida, y la ventana se oculta un
      // instante después: esconderla ya se comería la animación.
      ventana.win.webContents.send(IpcEvent.OverlayState, state);
      if (ventana.hideTimer) clearTimeout(ventana.hideTimer);
      ventana.hideTimer = setTimeout(() => {
        ventana.hideTimer = null;
        ventana.win.hide();
      }, EXIT_MS);
      return;
    }

    // Vuelve a haber algo que mostrar antes de que la ventana llegara a ocultarse.
    const ventana = this.ventanas.get(zona) ?? this.createWindow(zona);
    if (ventana.hideTimer) {
      clearTimeout(ventana.hideTimer);
      ventana.hideTimer = null;
    }
    ventana.win.webContents.send(IpcEvent.OverlayState, state);
    if (!ventana.win.isVisible()) ventana.win.showInactive();
    // Dentro de la banda topmost manda el orden Z: los avisos se re-elevan al mostrarse para
    // quedar siempre por encima del overlay de rendimiento (que también es topmost).
    ventana.win.moveTop();
  }

  private createWindow(zona: Zona): Ventana {
    const workArea = screen.getPrimaryDisplay().workArea;
    const { width, height } = TAMANO[zona];
    const win = new BrowserWindow({
      width,
      height,
      x:
        zona === 'left'
          ? workArea.x + MARGIN
          : workArea.x + workArea.width - width - MARGIN,
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
      win.webContents.send(IpcEvent.OverlayState, this.estadoDe(zona));
    });
    // Misma página en las dos: cada una recibe el estado filtrado y pinta lo que le toca.
    if (process.env['ELECTRON_RENDERER_URL']) {
      void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay.html`);
    } else {
      void win.loadFile(join(__dirname, '../renderer/overlay.html'));
    }

    const ventana: Ventana = { win, hideTimer: null };
    this.ventanas.set(zona, ventana);
    return ventana;
  }
}
