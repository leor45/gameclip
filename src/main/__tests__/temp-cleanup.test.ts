import { describe, expect, it } from 'vitest';
import {
  carpetasHuerfanas,
  limpiarTemporales,
  sinAsar,
  stagingsActuales,
  type EntornoTemp,
  type RegistroStaging,
} from '../temp-cleanup';

const TEMP = 'C:\\Users\\Leo\\AppData\\Local\\Temp';
const EN_USO = `${TEMP}\\GameClip-0.1.0`;
const EXE = `${EN_USO}\\GameClip.exe`;
const OBS64 = 'resources\\app.asar.unpacked\\node_modules\\@streamlabs\\obs-studio-node\\obs64.exe';

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
    const e = entorno(
      ['nsr584C.tmp'],
      [`${ajeno}\\nsProcess.dll`, `${ajeno}\\7z-out\\OtraApp.exe`],
    );

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

  // REGRESIÓN. Un cierre sucio (apagón, cuelgue, kill) mata también al launcher, que alcanza a
  // borrar el `7z-out` del staging pero no el `app-64.7z`. Lo que queda no tiene NINGUNO de los tres
  // marcadores: es indistinguible del staging de cualquier otra app de electron-builder, así que la
  // limpieza no puede reclamarlo por lo que hay dentro... pero sí por lo que la app anotó cuando ese
  // staging todavía era reconocible (al arrancar, con el `7z-out` recién extraído).
  it('borra un staging huérfano SIN marcador si lo registramos en su día', () => {
    const huerfano = `${TEMP}\\nsn6CB8.tmp`; // medido en la máquina del owner: 94 MB permanentes
    const e = entorno(['nsn6CB8.tmp'], [`${huerfano}\\app-64.7z`]);

    expect(carpetasHuerfanas(e)).toEqual([]); // por sí solo es invisible: no hay nada que lo delate
    expect(carpetasHuerfanas(e, [huerfano])).toEqual([huerfano]); // registrado, se reclama
  });

  it('un ns*.tmp ajeno con app-64.7z NO se toca (nunca lo registramos)', () => {
    // Otra app de electron-builder deja exactamente lo mismo dentro. Por eso no se reclama por el
    // contenido: solo se borra lo que anotamos nosotros.
    const ajeno = `${TEMP}\\nsAJENA.tmp`;
    const e = entorno(['nsAJENA.tmp'], [`${ajeno}\\app-64.7z`, `${ajeno}\\nsis7z.dll`]);

    expect(carpetasHuerfanas(e)).toEqual([]);
    expect(carpetasHuerfanas(e, [`${TEMP}\\nsOTRA.tmp`])).toEqual([]); // registrado ≠ este
  });

  it('una ruta registrada que ya no existe se ignora (no se inventa trabajo)', () => {
    const e = entorno([], []);
    expect(carpetasHuerfanas(e, [`${TEMP}\\nsBORRADA.tmp`])).toEqual([]);
  });

  it('el staging de ESTA ejecución se excluye explícitamente (lo tiene abierto el launcher)', () => {
    const ahora = `${TEMP}\\nseCD55.tmp`;
    const e = entorno(['nseCD55.tmp'], [`${ahora}\\7z-out\\GameClip.exe`], [ahora]);

    expect(carpetasHuerfanas(e, [], [ahora])).toEqual([]);
  });

  // REGRESIÓN 2 (encontrada verificando el .exe): tras un apagón, si el PC vuelve a arrancar rápido,
  // el staging huérfano es tan reciente que `esAnterior` lo toma por el de la ejecución en curso y
  // se salta. Por eso una ruta registrada se salta el filtro de edad: no puede ser la actual, porque
  // la actual es una carpeta aleatoria recién creada que ninguna ejecución anterior pudo anotar.
  it('borra el staging registrado aunque sea recentísimo (reinicio rápido tras el apagón)', () => {
    const delApagon = `${TEMP}\\nsq8065.tmp`;
    const miStaging = `${TEMP}\\nsNUEVO.tmp`;
    const e = entorno(
      ['nsq8065.tmp', 'nsNUEVO.tmp'],
      [`${delApagon}\\7z-out\\GameClip.exe`, `${miStaging}\\7z-out\\GameClip.exe`],
      [delApagon, miStaging], // las dos parecen "de ahora": el apagón fue hace 30 segundos
    );

    expect(carpetasHuerfanas(e, [delApagon], [miStaging])).toEqual([delApagon]);
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

describe('stagingsActuales', () => {
  // El staging de ESTA ejecución todavía tiene el marcador (el launcher acaba de extraerlo). Es la
  // única ventana en la que se puede reclamar sin ambigüedad: después degrada a un `app-64.7z`
  // genérico. De ahí que se anote ahora, para poder borrarlo en el arranque siguiente.
  it('es el staging con marcador que NO es de una ejecución anterior', () => {
    const ahora = `${TEMP}\\nsAHORA.tmp`;
    const viejo = `${TEMP}\\nsVIEJO.tmp`;
    const e = entorno(
      ['nsAHORA.tmp', 'nsVIEJO.tmp'],
      [`${ahora}\\app-64.7z`, `${viejo}\\app-64.7z`],
      [ahora],
    );

    expect(stagingsActuales(e)).toEqual([ahora]);
  });

  // REGRESIÓN 3 (encontrada verificando el .exe): a partir del SEGUNDO arranque el payload ya está
  // en el temporal, así que el launcher no extrae nada y **no crea `7z-out`**. Buscar ese marcador
  // dejaba sin registrar el staging justo en el caso más común, y esos 94 MB volvían a ser basura
  // permanente. El `app-64.7z` sí está siempre.
  it('reconoce su staging aunque no haya 7z-out (el payload ya estaba extraído)', () => {
    const ahora = `${TEMP}\\nsnDFAE.tmp`;
    const e = entorno(['nsnDFAE.tmp'], [`${ahora}\\app-64.7z`], [ahora]);

    expect(stagingsActuales(e)).toEqual([ahora]);
  });

  // REGRESIÓN 4 (v0.4.1, encontrada por el owner: 118 MB en su temporal). Al apartar una carpeta, el
  // renombrado le deja el mtime de ahora y el `app-64.7z` sigue dentro (el borrado falló, el
  // contenido está entero): durante el margen de edad es idéntica al staging de la ejecución en
  // curso. Se adoptaba como propia → se pasaba a `excluir` → `carpetasHuerfanas` la daba por
  // intocable antes de mirar el sufijo, y la carpeta condenada sobrevivía un ciclo más. Un `.borrar`
  // NUNCA es el staging de ahora: ese sufijo solo lo escribimos al dar una carpeta por muerta.
  it('no adopta como staging propio una carpeta ya apartada (.borrar)', () => {
    const apartada = `${TEMP}\\nsl4E5E.tmp.borrar`;
    const e = entorno(['nsl4E5E.tmp.borrar'], [`${apartada}\\app-64.7z`], [apartada]);

    expect(stagingsActuales(e)).toEqual([]);
  });

  it('no reclama el staging de otro instalador NSIS que corra a la vez', () => {
    const ajeno = `${TEMP}\\nsAJENA.tmp`;
    const e = entorno(['nsAJENA.tmp'], [`${ajeno}\\nsProcess.dll`], [ajeno]);

    expect(stagingsActuales(e)).toEqual([]);
  });

  it('en dev (sin portable) no hay staging que registrar', () => {
    expect(stagingsActuales(entorno([], []))).toEqual([]);
  });
});

describe('limpiarTemporales + registro', () => {
  /** Registro en memoria, con el mismo contrato que el de disco. */
  function registro(inicial: string[] = []): RegistroStaging & { rutas: string[] } {
    const r = {
      rutas: [...inicial],
      leer: () => r.rutas,
      escribir: (rutas: string[]) => {
        r.rutas = rutas;
      },
    };
    return r;
  }

  it('deja anotado el staging de esta ejecución, para poder borrarlo tras un cierre sucio', () => {
    const ahora = `${TEMP}\\nsAHORA.tmp`;
    const e = entorno(['nsAHORA.tmp'], [`${ahora}\\app-64.7z`], [ahora]);
    const reg = registro();

    limpiarTemporales(e, reg);

    expect(reg.rutas).toEqual([ahora]);
  });

  it('el staging propio no se anota dos veces al arrancar y al cerrar', () => {
    const ahora = `${TEMP}\\nsAHORA.tmp`;
    const e = entorno(['nsAHORA.tmp'], [`${ahora}\\app-64.7z`], [ahora]);
    const reg = registro();

    limpiarTemporales(e, reg); // arranque
    limpiarTemporales(e, reg); // cierre

    expect(reg.rutas).toEqual([ahora]);
  });

  it('una ruta registrada que no se pudo borrar sigue anotada, para reintentarla', () => {
    // El borrado real falla (la carpeta no existe en el disco de verdad, como si estuviera en uso):
    // la ruta no puede perderse, o esa basura volvería a ser irreclamable.
    const viejo = `${TEMP}\\nsVIEJO.tmp`;
    const e = entorno(['nsVIEJO.tmp'], [`${viejo}\\app-64.7z`]);
    const reg = registro([viejo]);

    limpiarTemporales(e, reg);

    expect(reg.rutas).toContain(viejo);
  });

  it('una ruta registrada que ya no está en el temporal se poda del registro', () => {
    const fantasma = `${TEMP}\\nsBORRADA.tmp`;
    const reg = registro([fantasma]);

    limpiarTemporales(entorno([], []), reg);

    expect(reg.rutas).toEqual([]);
  });

  // El daño colateral de la regresión 4: la carpeta condenada no solo se saltaba, sino que entraba
  // en el registro como si fuera el staging vivo de esta ejecución.
  it('una carpeta apartada (.borrar) no se anota como staging de esta ejecución', () => {
    const apartada = `${TEMP}\\nsl4E5E.tmp.borrar`;
    const e = entorno(['nsl4E5E.tmp.borrar'], [`${apartada}\\app-64.7z`], [apartada]);
    const reg = registro();

    limpiarTemporales(e, reg);

    expect(reg.rutas).toEqual([]);
  });

  it('sin registro se comporta como siempre (no rompe nada)', () => {
    const e = entorno([], []);
    expect(() => limpiarTemporales(e)).not.toThrow();
  });

  // REGRESIÓN 5, la gemela de la 4 y la que de verdad dejaba los 118 MB: Electron intercepta todo
  // `fs` sobre un path con `.asar` dentro, ABRE el archivo y cachea el handle para siempre. El
  // staging que borramos lleva un `7z-out\resources\app.asar`, así que el propio `rmSync` lo abría y
  // se bloqueaba a sí mismo: EBUSY contra un handle nuestro que no se soltaba mientras la app viviera
  // — y ni siquiera un arranque posterior podía rematar la carpeta, porque volvía a bloquearla.
  it('el borrado corre con el intérprete de asar apagado', () => {
    const proceso = process as NodeJS.Process & { noAsar?: boolean };
    let durante: boolean | undefined;

    const e = entorno([], []);
    e.listar = () => {
      durante = proceso.noAsar;
      return [];
    };

    limpiarTemporales(e);

    expect(durante).toBe(true);
    expect(proceso.noAsar).toBeUndefined(); // y se restaura al salir
  });
});

describe('sinAsar', () => {
  const proceso = process as NodeJS.Process & { noAsar?: boolean };

  it('restaura el valor anterior aunque fn reviente', () => {
    expect(() => sinAsar(() => { throw new Error('boom'); })).toThrow('boom'); // prettier-ignore

    expect(proceso.noAsar).toBeUndefined();
  });
});
