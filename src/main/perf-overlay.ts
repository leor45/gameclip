import { join } from 'node:path';
import { BrowserWindow, screen } from 'electron';
import { IpcEvent } from '@shared/ipc';
import type { PerfOverlayData } from '@shared/ipc';
import type { PerfOverlayConfig, PerfSnapshot } from '@shared/perf';
import { EMPTY_PERF_SNAPSHOT, perfWindowPosition } from '@shared/perf';

/**
 * Caja fija de la ventana: más grande que el contenido para que quepan las dos disposiciones (la
 * apaisada con las 9 métricas es larga). Los sliders interpolan esta caja por el work area y la
 * página ancla el bloque dentro según la banda del preset; la ventana es transparente y
 * click-through, así que el sobrante no existe para el usuario.
 */
const TAMANO = { width: 1100, height: 340 };
const MARGIN = 16;

/**
 * Overlay de rendimiento: UNA ventana transparente, click-through y persistente (a diferencia de
 * las del OverlayController, que solo existen mientras hay avisos).
 *
 * Las dos garantías clave de la feature viven aquí:
 * - `setContentProtection(true)` → `WDA_EXCLUDEFROMCAPTURE`: la ventana se ve en pantalla pero no
 *   sale en NINGUNA captura (game capture, WGC, duplicación DXGI). Por eso el overlay no aparece
 *   en clips ni grabaciones.
 * - Nivel topmost `'floating'`, por debajo del `'screen-saver'` de los avisos; además el
 *   OverlayController hace `moveTop()` al mostrar los suyos. REC/toast/aviso siempre ganan.
 */
export class PerfOverlayController {
  private win: BrowserWindow | null = null;
  private enabled: boolean;
  private config: PerfOverlayConfig;
  private snapshot: PerfSnapshot = EMPTY_PERF_SNAPSHOT;
  /** Ocultado con el hotkey. No persiste: reactivar el overlay lo devuelve visible. */
  private oculto = false;

  constructor(enabled: boolean, config: PerfOverlayConfig) {
    this.enabled = enabled;
    this.config = config;
    this.sync();
  }

  /** Ajustes guardados: estado nuevo completo. */
  configure(enabled: boolean, config: PerfOverlayConfig): void {
    if (enabled && !this.enabled) this.oculto = false; // renace visible
    this.enabled = enabled;
    this.config = config;
    this.sync();
  }

  /** Preview en vivo desde Ajustes (drag de sliders, color…): aplica sin persistir. */
  preview(config: PerfOverlayConfig): void {
    if (!this.enabled) return;
    this.config = config;
    this.sync();
  }

  /** Snapshot de métricas nuevo (cada ~1 s). */
  setSnapshot(snapshot: PerfSnapshot): void {
    this.snapshot = snapshot;
    if (this.win && this.win.isVisible()) this.pushData();
  }

  /** Hotkey global: alterna solo la visibilidad, sin tocar la configuración. */
  toggleVisibility(): void {
    if (!this.enabled) return;
    this.oculto = !this.oculto;
    this.sync();
  }

  /** ¿Hay ventana viva? (para tests/manual; con el overlay apagado no debe existir). */
  isAlive(): boolean {
    return this.win !== null;
  }

  destroy(): void {
    this.win?.destroy();
    this.win = null;
  }

  private sync(): void {
    if (!this.enabled) {
      // Apagado = sin ventana (criterio de aceptación), no una ventana escondida.
      this.destroy();
      return;
    }
    const win = this.win ?? this.createWindow();
    const workArea = screen.getPrimaryDisplay().workArea;
    const { x, y } = perfWindowPosition(this.config.posX, this.config.posY, workArea, TAMANO, MARGIN);
    win.setBounds({ x, y, ...TAMANO });
    this.pushData();
    if (this.oculto) {
      if (win.isVisible()) win.hide();
    } else if (!win.isVisible()) {
      win.showInactive();
    }
  }

  private pushData(): void {
    const data: PerfOverlayData = { config: this.config, snapshot: this.snapshot };
    this.win?.webContents.send(IpcEvent.PerfOverlayData, data);
  }

  private createWindow(): BrowserWindow {
    const win = new BrowserWindow({
      ...TAMANO,
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
    // WDA_EXCLUDEFROMCAPTURE: visible en pantalla, invisible para cualquier captura. Es lo que
    // mantiene el overlay fuera de clips y grabaciones aunque esté a la vista.
    win.setContentProtection(true);
    // 'floating' queda en la banda topmost pero los avisos ('screen-saver' + moveTop) van encima.
    win.setAlwaysOnTop(true, 'floating');
    win.setIgnoreMouseEvents(true);
    // La primera data llega antes de que la página cargue: se reenvía al terminar.
    win.webContents.on('did-finish-load', () => this.pushData());
    // La ventana es persistente: si su renderer muere o la carga falla (p. ej. el network service
    // de Chromium se reinicia durante el arranque), se recarga sola tras un respiro. Sin esto el
    // overlay queda en blanco hasta reiniciar la app.
    const recargar = () => {
      setTimeout(() => {
        if (this.win === win && !win.isDestroyed()) win.webContents.reload();
      }, 1000);
    };
    win.webContents.on('render-process-gone', recargar);
    win.webContents.on('did-fail-load', recargar);
    if (process.env['ELECTRON_RENDERER_URL']) {
      void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/perf-overlay.html`);
    } else {
      void win.loadFile(join(__dirname, '../renderer/perf-overlay.html'));
    }
    this.win = win;
    return win;
  }
}
