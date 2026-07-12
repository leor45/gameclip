import { describe, expect, it } from 'vitest';
import { carpetasHuerfanas, type EntornoTemp } from '../temp-cleanup';

const TEMP = 'C:\\Users\\Leo\\AppData\\Local\\Temp';
const EN_USO = `${TEMP}\\GameClip-0.1.0`;
const EXE = `${EN_USO}\\GameClip.exe`;
const OBS64 =
  'resources\\app.asar.unpacked\\node_modules\\@streamlabs\\obs-studio-node\\obs64.exe';

/**
 * Temporal falso. `archivos` es la lista de rutas que "existen": así cada carpeta se describe por lo
 * que tiene dentro, que es el criterio real. `actuales` son las carpetas de la ejecución en curso
 * (las que el launcher todavía tiene abiertas).
 */
function entorno(carpetas: string[], archivos: string[], actuales: string[] = []): EntornoTemp {
  const existentes = new Set(archivos.map((a) => a.toLowerCase()));
  const deAhora = new Set(actuales.map((a) => a.toLowerCase()));
  return {
    tempDir: TEMP,
    exePath: EXE,
    listar: () => carpetas,
    existe: (ruta) => existentes.has(ruta.toLowerCase()),
    esAnterior: (ruta) => !deAhora.has(ruta.toLowerCase()),
  };
}

describe('carpetasHuerfanas', () => {
  it('encuentra el payload de una ejecución anterior (GameClip.exe en la raíz)', () => {
    const viejo = `${TEMP}\\GameClip-0.0.9`;
    const e = entorno(['GameClip-0.0.9', 'GameClip-0.1.0'], [`${viejo}\\GameClip.exe`, EXE]);

    expect(carpetasHuerfanas(e)).toEqual([viejo]);
  });

  it('encuentra el staging del extractor (7z-out\\GameClip.exe)', () => {
    const staging = `${TEMP}\\nsi9069.tmp`;
    const e = entorno(['nsi9069.tmp'], [`${staging}\\7z-out\\GameClip.exe`]);

    expect(carpetasHuerfanas(e)).toEqual([staging]);
  });

  // El launcher borra lo que puede al salir y suele dejar el payload a medio borrar: sin el .exe
  // pero con `resources/`. Sin este marcador, esos restos (cientos de MB) serían invisibles para la
  // limpieza y se acumularían igual — que es el bug que esta tarea vino a resolver.
  it('encuentra un payload a medio borrar (ya sin el .exe, pero con obs64 dentro)', () => {
    const resto = `${TEMP}\\GameClip-0.0.9`;
    const e = entorno(['GameClip-0.0.9'], [`${resto}\\${OBS64}`, EXE]);

    expect(carpetasHuerfanas(e)).toEqual([resto]);
  });

  // El riesgo caro: los ns*.tmp los usa CUALQUIER instalador NSIS. Borrar por prefijo se llevaría
  // los temporales de otros programas (en la máquina del owner hay tres).
  it('NO toca el ns*.tmp de otro programa', () => {
    const ajeno = `${TEMP}\\nsr584C.tmp`;
    const e = entorno(['nsr584C.tmp'], [`${ajeno}\\nsProcess.dll`, `${ajeno}\\7z-out\\OtraApp.exe`]);

    expect(carpetasHuerfanas(e)).toEqual([]);
  });

  it('NO toca el payload de otra app de Electron (tiene resources/ pero no libobs)', () => {
    const ajena = `${TEMP}\\OtraApp-2.1.0`;
    const e = entorno(
      ['OtraApp-2.1.0'],
      [`${ajena}\\resources\\app.asar`, `${ajena}\\OtraApp.exe`],
    );

    expect(carpetasHuerfanas(e)).toEqual([]);
  });

  it('NO toca la carpeta de la ejecución en curso (sus archivos están en uso)', () => {
    const e = entorno(['GameClip-0.1.0'], [EXE]);

    expect(carpetasHuerfanas(e)).toEqual([]);
  });

  // El staging de ESTA ejecución lo tiene abierto el launcher (guarda su app-64.7z mientras la app
  // corre). Tocarlo dejaba una carpeta a medio borrar; se salta y lo limpia el cierre siguiente.
  it('NO toca el staging de la ejecución en curso', () => {
    const ahora = `${TEMP}\\nseCD55.tmp`;
    const e = entorno(['nseCD55.tmp'], [`${ahora}\\7z-out\\GameClip.exe`], [ahora]);

    expect(carpetasHuerfanas(e)).toEqual([]);
  });

  // El sufijo .borrar lo escribimos solo nosotros al apartar una carpeta: si quedó, es que el
  // borrado no llegó a completarse. Se reintenta sin esperar al filtro de edad.
  it('reintenta una carpeta que quedó apartada (.borrar) en un intento anterior', () => {
    const apartada = `${TEMP}\\nso45A3.tmp.borrar`;
    const e = entorno(['nso45A3.tmp.borrar'], [], [apartada]);

    expect(carpetasHuerfanas(e)).toEqual([apartada]);
  });

  it('la carpeta en uso se reconoce aunque cambien las mayúsculas (NTFS las ignora)', () => {
    const e = entorno(['gameclip-0.1.0'], [`${TEMP}\\gameclip-0.1.0\\GameClip.exe`]);

    expect(carpetasHuerfanas(e)).toEqual([]);
  });

  it('ignora carpetas sin nada nuestro dentro', () => {
    const e = entorno(
      ['vscode-stable-system-x64', 'scoped_dir9360_840408748'],
      [`${TEMP}\\vscode-stable-system-x64\\code.exe`],
    );

    expect(carpetasHuerfanas(e)).toEqual([]);
  });

  it('junta payload y staging de varias ejecuciones anteriores', () => {
    const p1 = `${TEMP}\\GameClip-0.0.9`;
    const s1 = `${TEMP}\\nsi1.tmp`;
    const s2 = `${TEMP}\\nsz2.tmp`;
    const e = entorno(
      ['GameClip-0.0.9', 'nsi1.tmp', 'nsz2.tmp', 'GameClip-0.1.0', 'ajena'],
      [
        `${p1}\\GameClip.exe`,
        `${s1}\\7z-out\\GameClip.exe`,
        `${s2}\\7z-out\\GameClip.exe`,
        EXE,
        `${TEMP}\\ajena\\otra.exe`,
      ],
    );

    expect(carpetasHuerfanas(e)).toEqual([p1, s1, s2]);
  });
});
