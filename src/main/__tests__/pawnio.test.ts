import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PAWNIO_DOWNLOAD_URL } from '@shared/perf';
import { isPawnIoInstalled, pawnIoBaseDir } from '../perf-metrics/pawnio';

// Detección de PawnIO, el driver del que depende **una sola** métrica del overlay (Temp CPU).
//
// Estos tests son la forma de probar el caso «usuario sin PawnIO» sin tocar el servicio: en la
// máquina del owner PawnIO está instalado por FanControl, que gobierna los ventiladores del PC, y
// pararlo para "ver el aviso" sería un riesgo térmico. Como la carpeta base es un parámetro, el caso
// ausente se monta con un directorio temporal vacío y se recorre la MISMA ruta de código que en un
// PC limpio.

const temporales: string[] = [];

function carpetaTemporal(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gameclip-pawnio-'));
  temporales.push(dir);
  return dir;
}

afterEach(() => {
  while (temporales.length > 0) {
    const dir = temporales.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('isPawnIoInstalled', () => {
  it('con PawnIOLib.dll en la carpeta, lo da por instalado', () => {
    const dir = carpetaTemporal();
    writeFileSync(join(dir, 'PawnIOLib.dll'), 'no importa el contenido');

    expect(isPawnIoInstalled(dir)).toBe(true);
  });

  it('sin la carpeta, no está instalado (el caso del usuario que se baja el portable)', () => {
    expect(isPawnIoInstalled(join(carpetaTemporal(), 'no-existe'))).toBe(false);
  });

  it('con la carpeta pero sin la DLL, no está instalado (desinstalación a medias)', () => {
    // Desinstalar PawnIO puede dejar el directorio vacío: mirar solo si la carpeta existe daría un
    // falso positivo y le negaríamos el enlace justo a quien lo necesita.
    expect(isPawnIoInstalled(carpetaTemporal())).toBe(false);
  });

  it('una ruta inválida es «no lo veo», no una excepción', () => {
    // Unidad inexistente / sin permisos: como mucho se muestra un aviso de más, que es el fallo
    // barato. Reventar dejaría Ajustes en blanco por un chequeo accesorio.
    expect(() => isPawnIoInstalled('Z:\\\0no-valida')).not.toThrow();
    expect(isPawnIoInstalled('Z:\\\0no-valida')).toBe(false);
  });
});

describe('pawnIoBaseDir', () => {
  it('usa ProgramFiles por defecto', () => {
    expect(pawnIoBaseDir({ ProgramFiles: 'C:\\Program Files' } as NodeJS.ProcessEnv)).toBe(
      join('C:\\Program Files', 'PawnIO'),
    );
  });

  it('GAMECLIP_PAWNIO_DIR la sobreescribe', () => {
    // Es lo que permite ver el aviso en la app real sin parar el servicio de nadie.
    const env = {
      ProgramFiles: 'C:\\Program Files',
      GAMECLIP_PAWNIO_DIR: 'D:\\fake-pawnio',
    } as NodeJS.ProcessEnv;

    expect(pawnIoBaseDir(env)).toBe('D:\\fake-pawnio');
  });

  it('un override vacío no cuenta (cae al de por defecto)', () => {
    const env = { ProgramFiles: 'C:\\Program Files', GAMECLIP_PAWNIO_DIR: '  ' } as NodeJS.ProcessEnv;

    expect(pawnIoBaseDir(env)).toBe(join('C:\\Program Files', 'PawnIO'));
  });

  it('sin ProgramFiles en el entorno, cae a la ruta estándar', () => {
    expect(pawnIoBaseDir({} as NodeJS.ProcessEnv)).toBe(join('C:\\Program Files', 'PawnIO'));
  });
});

describe('URL de descarga', () => {
  it('es la página oficial y nada más', () => {
    // Blindaje deliberado: PawnIO es un driver de kernel y al buscarlo salen antes mirrors
    // (Softonic, Nero, SourceForge). Que uno se cuele por un copiar-pegar sería un problema de
    // seguridad, así que la URL vive en una sola constante y este test la fija.
    expect(PAWNIO_DOWNLOAD_URL).toBe('https://pawnio.eu');
  });
});
