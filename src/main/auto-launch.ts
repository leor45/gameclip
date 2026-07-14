// Qué registrar en el arranque de Windows. Lógica pura (sin Electron) para poder testearla.

export interface LoginItemSettings {
  openAtLogin: boolean;
  /** Ruta del ejecutable a lanzar. */
  path: string;
  /** Argumentos: `--hidden` arranca en la bandeja. */
  args: string[];
}

/**
 * En el portable, `execPath` es la **copia extraída en %TEMP%** (efímera, `unpackDirName` de
 * electron-builder): registrarla haría que Windows apuntara a un ejecutable fantasma y la app no
 * arrancaría. El launcher portable expone la ruta **real** del .exe en `PORTABLE_EXECUTABLE_FILE`;
 * se registra esa. Fuera del portable la env no existe y se cae a `execPath` (lo que Electron usa
 * por defecto), así que el comportamiento no cambia.
 */
export function loginItemSettings(
  autoLaunch: boolean,
  env: NodeJS.ProcessEnv,
  execPath: string,
): LoginItemSettings {
  return {
    openAtLogin: autoLaunch,
    path: env.PORTABLE_EXECUTABLE_FILE ?? execPath,
    args: ['--hidden'],
  };
}
