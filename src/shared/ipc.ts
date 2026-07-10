// Contrato IPC entre main y renderer. Todo canal nuevo se declara aquí:
// nombre en IpcChannel y tipos de request/response en IpcContract.

export const IpcChannel = {
  AppVersion: 'app:version',
} as const;

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel];

export interface AppVersionInfo {
  version: string;
  electron: string;
}

// Mapa canal → { request, response }; el preload y el main lo usan para tipar invoke/handle.
export interface IpcContract {
  [IpcChannel.AppVersion]: {
    request: void;
    response: AppVersionInfo;
  };
}

// API que el preload expone en window.gameclip.
export interface GameclipApi {
  getAppVersion(): Promise<AppVersionInfo>;
}
