import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Detección de PawnIO, el driver que LibreHardwareMonitor 0.9.6 usa para leer los MSR del
// procesador. Se instala aparte y **solo hace falta para la temperatura de CPU**: todo lo de GPU
// (uso, temp, ventiladores, voltaje, VRAM) va por NVAPI/ADL, que son APIs de usuario, y CPU-uso y
// RAM ni siquiera pasan por el helper. De las nueve métricas del overlay, PawnIO condiciona una.
//
// Por eso esto NO es un chequeo de "¿puede arrancar la app?" sino de "¿le decimos al usuario dónde
// descargarlo?". Ese matiz decide el cómo: se mira si el driver ESTÁ INSTALADO (un fichero), no si
// su servicio está corriendo. Un servicio parado sigue estando instalado, y mandar a descargar lo
// que ya se tiene es peor que no decir nada. Además, consultar el servicio costaría un spawn de
// PowerShell por comprobación y podría, en el peor caso, tocar algo que no es nuestro: en las
// máquinas donde PawnIO ya existe suele haberlo puesto otro programa (FanControl, el propio
// LibreHardwareMonitor) que depende de él para gobernar los ventiladores.

// La URL de descarga vive en `@shared/perf` (`PAWNIO_DOWNLOAD_URL`): la pinta el renderer y se
// mantiene en una sola constante a propósito.

/** Carpeta de instalación por defecto de PawnIO. */
const DEFAULT_DIR_NAME = 'PawnIO';

/**
 * Fichero que se busca. Es la librería de usuario con la que se habla al driver: si está, PawnIO se
 * instaló. Se elige sobre `PawnIO.sys` porque el `.sys` puede existir sin que la instalación haya
 * terminado, y sobre la carpeta a secas porque un desinstalado a medias deja el directorio vacío.
 */
const MARKER = 'PawnIOLib.dll';

/**
 * Carpeta donde buscar PawnIO. `GAMECLIP_PAWNIO_DIR` la sobreescribe: es lo que permite **probar el
 * aviso de "no instalado" sin tocar el servicio** en una máquina que sí lo tiene (ver el spec de
 * `fix/sensores-pawnio`). No es un interruptor de "finge que falta" sino un cambio de ruta — la
 * misma ruta de código, otra carpeta —, así que lo que se prueba es lo que corre en un PC limpio.
 */
export function pawnIoBaseDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.GAMECLIP_PAWNIO_DIR;
  if (override && override.trim() !== '') return override;
  const programFiles = env.ProgramFiles ?? 'C:\\Program Files';
  return join(programFiles, DEFAULT_DIR_NAME);
}

/** true si PawnIO está instalado en `baseDir` (por defecto, el de `pawnIoBaseDir()`). */
export function isPawnIoInstalled(baseDir: string = pawnIoBaseDir()): boolean {
  try {
    return existsSync(join(baseDir, MARKER));
  } catch {
    // Una ruta inválida (unidad inexistente, permisos) es "no lo veo", no un crash: como mucho se
    // muestra un aviso de más, que es el fallo barato de los dos.
    return false;
  }
}
