import { Menu, Tray, nativeImage } from 'electron';

// Iconos 32×32 embebidos (círculo en el color de acento; rojo mientras se graba).
// Generados una vez con scripts propios: evita gestionar assets dev vs build.
const ICON_NORMAL =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAw0lEQVR42t2XwQ3DIAxFGcOTMAM7sIN3yDTswN0j/XOqSkSqmkDSCLCbw78gpP+wAdsOQk5T7l8BPIQihLgolrWhAAFCCUKA0FoRyp7QE+B9stwwrSlficqZOd8w/hbfBVg6mG9afgXgjubNSNRyvg6SvwKQBwLkM4Aw0HxTaAGkCQCpBYAJAKgB+Anmu8v4CRAnAsQjAJ4IwCYB1FOgfgnVn6GJj0j9K1YvRibKsXpDYqIlM9GUmmjLTQwmZkazZ07HL/MNfoA+eJ5oAAAAAElFTkSuQmCC';
const ICON_RECORDING =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAxElEQVR42t2XwQ3DIAxFWcpI3oAd2ME7ZBp2YB+PwDlVJSJVSSFpBLbTw78gpP+wAduOEZym3FMBPCNERqCqWNemAgRGSIxQGGFtqNQ9YSTA+2S5Y9pSvhKVM3O6YbwX3QVYBphvWn4FoIHm3Ui0cr5Okr8CkCcC5DOAMNF8U+gBJAGA1AMoAgClBeAFzA+X8RMgCgLEbwAkCEAmAdRToH4J1Z+hiY9I/StWL0YmyrF6Q2KiJTPRlJpoy00MJmZGs/+cjl+Q74JiXJZk5QAAAABJRU5ErkJggg==';

export interface TrayActions {
  onShow: () => void;
  onSaveReplay: () => void;
  onQuit: () => void;
}

export interface AppTray {
  setRecording(recording: boolean): void;
  destroy(): void;
}

/**
 * Icono de bandeja con menú (Abrir · Guardar clip · Salir). Doble clic abre la ventana;
 * el icono cambia a rojo mientras se graba.
 */
export function createTray(actions: TrayActions): AppTray {
  const normal = nativeImage.createFromDataURL(`data:image/png;base64,${ICON_NORMAL}`);
  const recording = nativeImage.createFromDataURL(`data:image/png;base64,${ICON_RECORDING}`);

  const tray = new Tray(normal);
  tray.setToolTip('GameClip');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir GameClip', click: actions.onShow },
      { label: 'Guardar clip', click: actions.onSaveReplay },
      { type: 'separator' },
      { label: 'Salir', click: actions.onQuit },
    ]),
  );
  tray.on('double-click', actions.onShow);

  return {
    setRecording(rec: boolean) {
      // Un `status` tardío (uno en vuelo, un timer pendiente) puede llegar con la bandeja ya
      // destruida, y en Electron tocar un Tray muerto LANZA. El cierre está ordenado para que no
      // ocurra, pero la bandeja se defiende igual: así el bug no vuelve por otro camino.
      if (tray.isDestroyed()) return;
      tray.setImage(rec ? recording : normal);
      tray.setToolTip(rec ? 'GameClip — grabando' : 'GameClip');
    },
    destroy() {
      if (tray.isDestroyed()) return;
      tray.destroy();
    },
  };
}
