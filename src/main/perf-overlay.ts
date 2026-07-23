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
 * Cada cuánto se re-eleva la ventana mientras está visible. Un juego que arranca DESPUÉS del
 * overlay puede quedar por encima (pasaba con RE Requiem en ventana sin bordes: el overlay no
 * aparecía hasta hacer alt+tab, que reordena las ventanas). Re-elevarse periódicamente lo
 * devuelve al frente sin esperar a que el usuario haga nada.
 */
const RAISE_MS = 2000;

/**
 * Overlay de rendimiento: UNA ventana transparente, click-through y persistente (a diferencia de
 * las del OverlayController, que solo existen mientras hay avisos).
 *
 * Las dos garantías clave de la feature viven aquí:
 * - `setContentProtection(true)` → `WDA_EXCLUDEFROMCAPTURE`: la ventana se ve en pantalla pero no
 *   sale en NINGUNA captura (game capture, WGC, duplicación DXGI). Por eso el overlay no aparece
 *   en clips ni grabaciones. **Ya no es permanente:** se aplica solo mientras el pipeline captura el
 *   monitor, para que el overlay sí se vea al compartir pantalla o en un recorte de Windows. Lo
 *   decide `needsContentProtection()` en el manager; aquí solo se obedece (`setCaptureProtection`).
 * - Nivel topmost `'screen-saver'`, el único que queda por encima de las ventanas sin bordes de
 *   los juegos. Los avisos (REC/toast/aviso) comparten banda, así que el orden lo decide quién
 *   sube último: cada vez que este overlay se re-eleva, vuelve a elevar los avisos detrás
 *   (`raiseNotices`), y el OverlayController también hace `moveTop()` al mostrarlos. Resultado:
 *   el overlay tapa al juego, pero nunca a los avisos.
 */
export class PerfOverlayController {
  private win: BrowserWindow | null = null;
  private enabled: boolean;
  private visible: boolean;
  private config: PerfOverlayConfig;
  private snapshot: PerfSnapshot = EMPTY_PERF_SNAPSHOT;
  private raiseTimer: NodeJS.Timeout | null = null;
  /**
   * ¿Oculto de las capturas ahora mismo? Nace en `true` (ver la creación de la ventana) y lo baja el
   * manager cuando el pipeline no está capturando el monitor.
   */
  private protegido = true;

  constructor(
    enabled: boolean,
    visible: boolean,
    config: PerfOverlayConfig,
    /** Vuelve a elevar los avisos, para que queden por encima tras cada re-elevación. */
    private readonly raiseNotices: () => void = () => undefined,
  ) {
    this.enabled = enabled;
    this.visible = visible;
    this.config = config;
    this.sync();
  }

  /**
   * Oculta (o no) el overlay de las capturas. Lo decide el `CaptureManager` según lo que esté
   * capturando; aquí solo se aplica.
   *
   * Solo se llama a `setContentProtection` **cuando el valor cambia**: es una llamada Win32 sobre la
   * ventana y el manager recalcula en cada transición de captura, así que repetirla sería gratis en
   * el mejor caso y un parpadeo en el peor. Tras conmutarla se reaplica `setAlwaysOnTop`, porque
   * tocar la protección puede reordenar la ventana y el overlay perdería su nivel `screen-saver`
   * —quedándose por debajo de los juegos sin bordes—.
   */
  setCaptureProtection(protegido: boolean): void {
    if (protegido === this.protegido) return;
    this.protegido = protegido;
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    win.setContentProtection(protegido);
    win.setAlwaysOnTop(true, 'screen-saver');
    this.raiseNotices();
  }

  /** Ajustes guardados: estado nuevo completo. */
  configure(enabled: boolean, visible: boolean, config: PerfOverlayConfig): void {
    this.enabled = enabled;
    this.visible = visible;
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

  /** ¿Hay ventana viva? (para tests/manual; con el overlay apagado no debe existir). */
  isAlive(): boolean {
    return this.win !== null;
  }

  destroy(): void {
    this.stopRaiseTimer();
    this.win?.destroy();
    this.win = null;
  }

  /** Se pone al frente y deja los avisos por encima suyo. */
  private raise(): void {
    if (!this.win || this.win.isDestroyed() || !this.win.isVisible()) return;
    this.win.moveTop();
    this.raiseNotices();
  }

  private startRaiseTimer(): void {
    if (this.raiseTimer) return;
    this.raiseTimer = setInterval(() => this.raise(), RAISE_MS);
  }

  private stopRaiseTimer(): void {
    if (!this.raiseTimer) return;
    clearInterval(this.raiseTimer);
    this.raiseTimer = null;
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
    if (!this.visible) {
      if (win.isVisible()) win.hide();
      this.stopRaiseTimer();
    } else {
      if (!win.isVisible()) win.showInactive();
      // Recién mostrado (o reposicionado): al frente ya, sin esperar al primer tick del timer.
      this.raise();
      this.startRaiseTimer();
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
    // WDA_EXCLUDEFROMCAPTURE: visible en pantalla, invisible para cualquier captura. La ventana
    // NACE protegida y se desprotege cuando el manager lo diga (ver `setCaptureProtection`): así, si
    // algún día ese cable se rompiera, el fallo sería «no se ve en una captura externa» —lo de
    // siempre— y nunca «se coló en un clip del usuario».
    win.setContentProtection(this.protegido);
    // 'screen-saver' es el único nivel que queda por encima de las ventanas sin bordes de los
    // juegos; los avisos comparten nivel y ganan porque se re-elevan detrás de este (ver arriba).
    win.setAlwaysOnTop(true, 'screen-saver');
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
