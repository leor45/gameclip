import { beforeEach, describe, expect, it, vi } from 'vitest';

// Doble de Electron con la semántica real del Tray: tras destroy(), tocarlo lanza.
const trays: TrayFalso[] = [];

class TrayFalso {
  destruido = false;
  setImage = vi.fn(() => this.comprobarVivo());
  setToolTip = vi.fn(() => this.comprobarVivo());
  setContextMenu = vi.fn(() => this.comprobarVivo());
  on = vi.fn();
  destroy = vi.fn(() => {
    this.destruido = true;
  });
  isDestroyed = vi.fn(() => this.destruido);

  private comprobarVivo(): void {
    if (this.destruido) throw new Error('Tray is destroyed');
  }
}

vi.mock('electron', () => ({
  Tray: vi.fn(() => {
    const t = new TrayFalso();
    trays.push(t);
    return t;
  }),
  Menu: { buildFromTemplate: vi.fn(() => ({})) },
  nativeImage: { createFromDataURL: vi.fn(() => ({})) },
}));

const { createTray } = await import('../tray');

const acciones = { onShow: vi.fn(), onSaveReplay: vi.fn(), onQuit: vi.fn() };

describe('AppTray', () => {
  beforeEach(() => {
    trays.length = 0;
  });

  it('setRecording pinta el icono mientras la bandeja vive', () => {
    const tray = createTray(acciones);

    tray.setRecording(true);

    expect(trays[0].setImage).toHaveBeenCalled();
    expect(trays[0].setToolTip).toHaveBeenLastCalledWith('GameClip — grabando');
  });

  // REGRESIÓN: un status tardío llegaba a la bandeja ya destruida y Electron reventaba con
  // "Tray is destroyed". El orden del cierre lo evita, pero la bandeja tiene que defenderse igual:
  // cualquier emisor futuro (un timer pendiente, un evento en vuelo) volvería a romperla.
  it('setRecording después de destroy no lanza', () => {
    const tray = createTray(acciones);
    tray.destroy();

    expect(() => tray.setRecording(true)).not.toThrow();
    expect(trays[0].setImage).not.toHaveBeenCalled();
  });

  it('destroy es idempotente', () => {
    const tray = createTray(acciones);

    tray.destroy();
    expect(() => tray.destroy()).not.toThrow();
    expect(trays[0].destroy).toHaveBeenCalledTimes(1);
  });
});
