import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  ELEVATED_TASK_NAME,
  ElevatedAutoLaunch,
  ElevationRelaunch,
  elevatedTaskMatches,
  powershellElevatedArgs,
  powershellRelaunchElevatedArgs,
  schtasksCreateArgs,
  schtasksDeleteArgs,
} from '../elevated-launch';

describe('schtasks args', () => {
  it('crea la tarea al logon con RunLevel HIGHEST y ruta entrecomillada', () => {
    const line = schtasksCreateArgs('C:\\Juegos\\Game Clip\\GameClip.exe');
    expect(line).toContain(`/TN ${ELEVATED_TASK_NAME}`);
    expect(line).toContain('/SC ONLOGON');
    expect(line).toContain('/RL HIGHEST');
    expect(line).toContain('/F');
    // La ruta con espacios viaja escapada dentro de /TR, con el flag --hidden del arranque.
    expect(line).toContain('"\\"C:\\Juegos\\Game Clip\\GameClip.exe\\" --hidden"');
  });

  it('borra la tarea por nombre sin preguntar', () => {
    expect(schtasksDeleteArgs()).toBe(`/Delete /TN ${ELEVATED_TASK_NAME} /F`);
  });
});

// PowerShell trata como comilla simple la ' ASCII y también ‘ ’ ‚ ‛ (U+2018, U+2019, U+201A, U+201B).
const COMILLAS_SIMPLES = ["'", '\u2018', '\u2019', '\u201A', '\u201B'];
// Una ruta de portable «difícil»: las cinco comillas, espacios, metacaracteres de PowerShell, ñ y CJK.
const RUTA_DIFICIL = `D:\\Juegos de Leo’s ‘x’ ‚y‛ it's $(calc) \`n [a]\\ñandú ゲーム\\GameClip.exe`;
const baseEnv = { SystemRoot: 'C:\\Windows', Path: 'C:\\Windows\\System32' };

describe('powershellElevatedArgs', () => {
  it('lanza schtasks elevado (RunAs), espera y propaga el exit code', () => {
    const { args } = powershellElevatedArgs('/Delete /TN X /F', baseEnv);
    const comando = args[args.length - 1];
    expect(args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-Command']);
    expect(comando).toContain('-Verb RunAs');
    expect(comando).toContain('-WindowStyle Hidden -Wait -PassThru');
    expect(comando).toContain('-ArgumentList $env:GAMECLIP_SCHTASKS_ARGS');
    expect(comando).toContain('exit $p.ExitCode');
  });

  it('si Start-Process falla (UAC cancelado) sale con 1, no con el 0 de `exit $null`', () => {
    // Regresión: el error de Start-Process no es terminante; `$p` quedaba $null y `exit $p.ExitCode`
    // salía con 0, así que cancelar el UAC se daba por aplicado (medido en Windows: EXIT=0).
    const comando = powershellElevatedArgs('/Delete /TN X /F', baseEnv).args.at(-1)!;
    expect(comando).toMatch(/^try \{/);
    expect(comando).toContain('-ErrorAction Stop');
    expect(comando).toMatch(/catch \{ exit 1 \}$/);
  });

  it('la línea de schtasks viaja por el entorno, nunca dentro del script (regresión: ruta con ’)', () => {
    // PowerShell cierra una cadena entre comillas simples con ‘ ’ ‚ ‛ además de con ': una ruta del
    // portable como «Leo’s» daba ParserError, schtasks no corría y el ajuste se revertía. Escapar
    // solo la ' ASCII no basta; sin interpolar no hay nada que escapar.
    for (const comilla of COMILLAS_SIMPLES) {
      const linea = schtasksCreateArgs(`D:\\Juegos de Leo${comilla}s\\GameClip.exe`);
      const { args, env } = powershellElevatedArgs(linea, baseEnv);
      const comando = args.at(-1)!;
      expect(comando).not.toContain('Leo');
      expect(comando).not.toContain('GameClip.exe');
      for (const c of COMILLAS_SIMPLES) expect(comando).not.toContain(c);
      expect(env.GAMECLIP_SCHTASKS_ARGS).toBe(linea);
    }
  });

  it('el script es el mismo para cualquier línea (nada del dato entra en él)', () => {
    const a = powershellElevatedArgs(schtasksDeleteArgs(), baseEnv).args;
    const b = powershellElevatedArgs(schtasksCreateArgs(RUTA_DIFICIL), baseEnv).args;
    expect(b).toEqual(a);
  });

  it('el entorno hereda el de origen (PATH, SystemRoot…) sin modificarlo', () => {
    const { env } = powershellElevatedArgs('/Delete /TN X /F', baseEnv);
    expect(env).toEqual({ ...baseEnv, GAMECLIP_SCHTASKS_ARGS: '/Delete /TN X /F' });
    expect(baseEnv).not.toHaveProperty('GAMECLIP_SCHTASKS_ARGS');
  });

  it('por defecto parte de process.env, sin escribir la variable en el proceso de la app', () => {
    const { env } = powershellElevatedArgs('/Delete /TN X /F');
    expect(env).not.toBe(process.env);
    for (const [clave, valor] of Object.entries(process.env)) expect(env[clave]).toBe(valor);
    expect(process.env.GAMECLIP_SCHTASKS_ARGS).toBeUndefined();
  });
});

describe('powershellRelaunchElevatedArgs', () => {
  it('relanza el exe real como admin y conserva argumentos', () => {
    const { args } = powershellRelaunchElevatedArgs(
      'D:\\Game Clip\\GameClip-0.9.2.exe',
      ['--hidden', '--otro'],
      baseEnv,
    );
    const comando = args.at(-1)!;
    expect(args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-Command']);
    expect(comando).toBe(
      'try { Start-Process -FilePath $env:GAMECLIP_RELAUNCH_EXE' +
        ' -ArgumentList @($env:GAMECLIP_RELAUNCH_ARG_0, $env:GAMECLIP_RELAUNCH_ARG_1)' +
        ' -Verb RunAs; exit 0 } catch { exit 1 }',
    );
  });

  it('sin argumentos no emite -ArgumentList (como antes)', () => {
    const comando = powershellRelaunchElevatedArgs('D:\\GameClip.exe', [], baseEnv).args.at(-1)!;
    expect(comando).toBe(
      'try { Start-Process -FilePath $env:GAMECLIP_RELAUNCH_EXE -Verb RunAs; exit 0 } catch { exit 1 }',
    );
  });

  it('la ruta y los argumentos viajan por el entorno, nunca dentro del script', () => {
    for (const comilla of COMILLAS_SIMPLES) {
      const ruta = `D:\\Juegos de Leo${comilla}s\\GameClip.exe`;
      const arg = `--ruta=Leo${comilla}s`;
      const { args, env } = powershellRelaunchElevatedArgs(ruta, ['--hidden', arg], baseEnv);
      const comando = args.at(-1)!;
      expect(comando).not.toContain('Leo');
      expect(comando).not.toContain('GameClip.exe');
      expect(comando).not.toContain('--hidden');
      for (const c of COMILLAS_SIMPLES) expect(comando).not.toContain(c);
      expect(env).toEqual({
        ...baseEnv,
        GAMECLIP_RELAUNCH_EXE: ruta,
        GAMECLIP_RELAUNCH_ARG_0: '--hidden',
        GAMECLIP_RELAUNCH_ARG_1: arg,
      });
    }
  });

  it('el entorno hereda el de origen sin modificarlo; por defecto parte de process.env', () => {
    powershellRelaunchElevatedArgs('D:\\GameClip.exe', ['--hidden'], baseEnv);
    expect(baseEnv).not.toHaveProperty('GAMECLIP_RELAUNCH_EXE');
    const { env } = powershellRelaunchElevatedArgs('D:\\GameClip.exe', ['--hidden']);
    expect(env).not.toBe(process.env);
    for (const [clave, valor] of Object.entries(process.env)) expect(env[clave]).toBe(valor);
    expect(process.env.GAMECLIP_RELAUNCH_EXE).toBeUndefined();
    expect(process.env.GAMECLIP_RELAUNCH_ARG_0).toBeUndefined();
  });
});

// --- PowerShell real ---------------------------------------------------------------------------
// Ejecuta el `-Command` generado con un `Start-Process` falso por delante (una función gana al
// cmdlet): así se comprueba que PowerShell PARSEA el script y que recibe la ruta byte a byte, sin
// lanzar nada ni disparar UAC. El falso vuelca lo recibido en un archivo UTF-8 (sin pasar por la
// codepage de la consola).
const START_PROCESS_FALSO = [
  'function Start-Process { [CmdletBinding()] param([string]$FilePath, [string[]]$ArgumentList, [string]$Verb, [string]$WindowStyle, [switch]$Wait, [switch]$PassThru)',
  "$r = [ordered]@{ filePath = $FilePath; argumentList = $ArgumentList; tieneArgumentList = $PSBoundParameters.ContainsKey('ArgumentList'); verb = $Verb; windowStyle = $WindowStyle; wait = [bool]$Wait; passThru = [bool]$PassThru }",
  '[IO.File]::WriteAllText($env:GAMECLIP_TEST_OUT, (ConvertTo-Json -InputObject $r -Compress), (New-Object Text.UTF8Encoding $false))',
  "if ($env:GAMECLIP_TEST_FALLO -eq 'throw') { throw 'UAC cancelado' }",
  "if ($env:GAMECLIP_TEST_FALLO -eq 'error') { Write-Error 'UAC cancelado'; return }",
  '[pscustomobject]@{ ExitCode = [int]$env:GAMECLIP_TEST_EXIT }',
  '}',
].join('; ');

interface Recibido {
  filePath: string;
  argumentList: string[] | null;
  tieneArgumentList: boolean;
  verb: string;
  windowStyle: string;
  wait: boolean;
  passThru: boolean;
}

const dirTemporal = mkdtempSync(join(tmpdir(), 'gameclip-elevated-'));
let contador = 0;
afterAll(() => rmSync(dirTemporal, { recursive: true, force: true }));

function ejecutarConStartProcessFalso(
  cmd: { args: string[]; env: NodeJS.ProcessEnv },
  extra: { exit?: number; fallo?: 'throw' | 'error' } = {},
): Promise<{ exitCode: number; stderr: string; recibido: Recibido | null }> {
  const salida = join(dirTemporal, `recibido-${contador++}.json`);
  const args = [...cmd.args.slice(0, -1), `${START_PROCESS_FALSO} ${cmd.args.at(-1)}`];
  const env = {
    ...cmd.env,
    GAMECLIP_TEST_OUT: salida,
    GAMECLIP_TEST_EXIT: String(extra.exit ?? 0),
    ...(extra.fallo ? { GAMECLIP_TEST_FALLO: extra.fallo } : {}),
  };
  return new Promise((resolve) => {
    execFile('powershell.exe', args, { env, windowsHide: true, timeout: 30000 }, (err, _out, stderr) => {
      let recibido: Recibido | null = null;
      try {
        recibido = JSON.parse(readFileSync(salida, 'utf8')) as Recibido;
      } catch {
        // El falso no llegó a ejecutarse (p. ej. ParserError).
      }
      const code = (err as { code?: unknown } | null)?.code;
      resolve({ exitCode: err ? (typeof code === 'number' ? code : -1) : 0, stderr, recibido });
    });
  });
}

describe.runIf(process.platform === 'win32')('con PowerShell real (Start-Process falso)', () => {
  it('alta de la tarea: PowerShell parsea el script y recibe la línea de schtasks intacta, con ’ ‘ ‚ ‛ \'', async () => {
    const lineas = [
      schtasksCreateArgs(RUTA_DIFICIL),
      ...COMILLAS_SIMPLES.map((c) => schtasksCreateArgs(`D:\\Juegos de Leo${c}s\\GameClip.exe`)),
    ];
    const resultados = await Promise.all(
      lineas.map((linea) => ejecutarConStartProcessFalso(powershellElevatedArgs(linea))),
    );
    resultados.forEach((r, i) => {
      expect(r.stderr).toBe('');
      expect(r.exitCode).toBe(0);
      expect(r.recibido).toEqual({
        filePath: 'schtasks.exe',
        argumentList: [lineas[i]],
        tieneArgumentList: true,
        verb: 'RunAs',
        windowStyle: 'Hidden',
        wait: true,
        passThru: true,
      });
    });
  }, 60000);

  it('borrado de la tarea: llega la línea de /Delete', async () => {
    const r = await ejecutarConStartProcessFalso(powershellElevatedArgs(schtasksDeleteArgs()));
    expect(r.exitCode).toBe(0);
    expect(r.recibido?.argumentList).toEqual([schtasksDeleteArgs()]);
  }, 30000);

  it('relanzado: PowerShell parsea el script y recibe la ruta y los argumentos intactos', async () => {
    const rutas = [RUTA_DIFICIL, ...COMILLAS_SIMPLES.map((c) => `D:\\Juegos de Leo${c}s\\GameClip.exe`)];
    const resultados = await Promise.all(
      rutas.map((ruta) =>
        ejecutarConStartProcessFalso(powershellRelaunchElevatedArgs(ruta, ['--hidden', `--x=${ruta}`])),
      ),
    );
    resultados.forEach((r, i) => {
      expect(r.stderr).toBe('');
      expect(r.exitCode).toBe(0);
      expect(r.recibido).toEqual({
        filePath: rutas[i],
        argumentList: ['--hidden', `--x=${rutas[i]}`],
        tieneArgumentList: true,
        verb: 'RunAs',
        windowStyle: '',
        wait: false,
        passThru: false,
      });
    });
  }, 60000);

  it('relanzado sin argumentos: Start-Process no recibe -ArgumentList', async () => {
    const r = await ejecutarConStartProcessFalso(powershellRelaunchElevatedArgs(RUTA_DIFICIL, []));
    expect(r.exitCode).toBe(0);
    expect(r.recibido).toMatchObject({
      filePath: RUTA_DIFICIL,
      tieneArgumentList: false,
      verb: 'RunAs',
    });
  }, 30000);

  it('el exit code se sigue propagando: el del proceso elevado, y 1 si Start-Process falla', async () => {
    const cmd = powershellElevatedArgs(schtasksDeleteArgs());
    const [tres, lanza, errorNoTerminante] = await Promise.all([
      ejecutarConStartProcessFalso(cmd, { exit: 3 }),
      ejecutarConStartProcessFalso(cmd, { fallo: 'throw' }),
      ejecutarConStartProcessFalso(cmd, { fallo: 'error' }),
    ]);
    expect(tres.exitCode).toBe(3);
    expect(lanza.exitCode).toBe(1);
    // El caso real del UAC cancelado: error no terminante; sin -ErrorAction Stop salía con 0.
    expect(errorNoTerminante.exitCode).toBe(1);
  }, 30000);

  it('el relanzado sale con 1 si Start-Process falla y con 0 si arranca', async () => {
    const cmd = powershellRelaunchElevatedArgs('D:\\GameClip.exe', ['--hidden']);
    const [bien, mal] = await Promise.all([
      ejecutarConStartProcessFalso(cmd),
      ejecutarConStartProcessFalso(cmd, { fallo: 'throw' }),
    ]);
    expect(bien.exitCode).toBe(0);
    expect(mal.exitCode).toBe(1);
  }, 30000);
});

describe('ElevatedAutoLaunch', () => {
  it('resuelve true cuando el run elevado termina bien', async () => {
    const run = vi.fn().mockResolvedValue(true);
    const launcher = new ElevatedAutoLaunch({ run });
    await expect(launcher.setEnabled(true, 'C:\\app.exe')).resolves.toBe(true);
    // La línea de schtasks viaja por el entorno que recibe `run`, no dentro de los args.
    const [args, env] = run.mock.calls[0];
    expect(args.at(-1)).toContain('$env:GAMECLIP_SCHTASKS_ARGS');
    expect(env.GAMECLIP_SCHTASKS_ARGS).toContain('/Create');
    expect(env.GAMECLIP_SCHTASKS_ARGS).toContain('C:\\app.exe');
  });

  it('una ruta con ’ llega intacta a `run` (regresión: ParserError y ajuste revertido)', async () => {
    const run = vi.fn().mockResolvedValue(true);
    const launcher = new ElevatedAutoLaunch({ run });
    const exe = 'D:\\Juegos de Leo’s\\GameClip.exe';
    await expect(launcher.setEnabled(true, exe)).resolves.toBe(true);
    const [args, env] = run.mock.calls[0];
    expect(args.join(' ')).not.toContain('Leo');
    expect(env.GAMECLIP_SCHTASKS_ARGS).toBe(schtasksCreateArgs(exe));
  });

  it('el borrado de la tarea también pasa la línea por el entorno', async () => {
    const run = vi.fn().mockResolvedValue(true);
    await new ElevatedAutoLaunch({ run }).setEnabled(false, 'C:\\app.exe');
    expect(run.mock.calls[0][1].GAMECLIP_SCHTASKS_ARGS).toBe(schtasksDeleteArgs());
  });

  it('propaga el false de run (UAC cancelado) tal cual', async () => {
    const launcher = new ElevatedAutoLaunch({ run: vi.fn().mockResolvedValue(false) });
    await expect(launcher.setEnabled(true, 'C:\\app.exe')).resolves.toBe(false);
  });

  it('UAC cancelado o error → false, sin excepción', async () => {
    const launcher = new ElevatedAutoLaunch({ run: vi.fn().mockRejectedValue(new Error('nope')) });
    await expect(launcher.setEnabled(false, 'C:\\app.exe')).resolves.toBe(false);
  });

  it('repara una tarea existente cuyo action apunta al portable de una versión anterior', async () => {
    const run = vi.fn().mockResolvedValue(true);
    const query = vi.fn().mockResolvedValue(
      '<Task><Actions><Exec><Command>D:\\GameClip-0.9.0.exe</Command><Arguments>--hidden</Arguments></Exec></Actions></Task>',
    );
    const launcher = new ElevatedAutoLaunch({ run, query });

    await expect(launcher.ensureEnabled('D:\\GameClip-0.9.1.exe')).resolves.toBe(true);
    expect(run).toHaveBeenCalledOnce();
  });

  it('no solicita elevación si la tarea ya lanza el exe actual oculto', async () => {
    const run = vi.fn();
    const query = vi.fn().mockResolvedValue(
      '<Task><Actions><Exec><Command>D:\\GameClip-0.9.1.exe</Command><Arguments>--hidden</Arguments></Exec></Actions></Task>',
    );
    const launcher = new ElevatedAutoLaunch({ run, query });

    await expect(launcher.ensureEnabled('D:\\GameClip-0.9.1.exe')).resolves.toBe(true);
    expect(run).not.toHaveBeenCalled();
  });

  it('reconoce command y argumentos correctos en el XML de schtasks', () => {
    const xml = '<Task><Actions><Exec><Command>C:\\Game Clip\\GameClip.exe</Command><Arguments>--hidden</Arguments></Exec></Actions></Task>';
    expect(elevatedTaskMatches(xml, 'C:\\Game Clip\\GameClip.exe')).toBe(true);
    expect(elevatedTaskMatches(xml, 'C:\\Game Clip\\GameClip-actualizado.exe')).toBe(false);
  });

  describe('XML real de schtasks (regresión: la tarea nunca coincidía y se recreaba en cada arranque)', () => {
    // Copiado de `schtasks /Query /TN GameClipAutoStart /XML` en la máquina del owner: schtasks guarda
    // la ruta ENTRECOMILLADA, tal como la crea schtasksCreateArgs.
    const real =
      '<Task><Actions Context="Author"><Exec>\r\n' +
      '      <Command>"D:\\Projects\\gameclip\\release\\GameClip-0.9.4-portable.exe"</Command>\r\n' +
      '      <Arguments>--hidden</Arguments>\r\n' +
      '    </Exec></Actions></Task>';
    const exe = 'D:\\Projects\\gameclip\\release\\GameClip-0.9.4-portable.exe';

    it('reconoce la tarea aunque la ruta venga entre comillas', () => {
      expect(elevatedTaskMatches(real, exe)).toBe(true);
    });

    it('decodifica entidades XML y no distingue mayúsculas (rutas de Windows)', () => {
      const conAmp = real.replace('gameclip\\release', 'juegos &amp; clips');
      expect(elevatedTaskMatches(conAmp, 'D:\\Projects\\juegos & clips\\GameClip-0.9.4-portable.exe')).toBe(true);
      expect(elevatedTaskMatches(real, exe.toLowerCase())).toBe(true);
    });

    it('otra versión del portable sigue sin coincidir', () => {
      expect(elevatedTaskMatches(real, exe.replace('0.9.4', '0.9.5'))).toBe(false);
    });

    it('ensureEnabled con la tarea real correcta no eleva', async () => {
      const run = vi.fn();
      const launcher = new ElevatedAutoLaunch({ run, query: vi.fn().mockResolvedValue(real) });
      await expect(launcher.ensureEnabled(exe)).resolves.toBe(true);
      expect(run).not.toHaveBeenCalled();
    });
  });
});

describe('ElevationRelaunch', () => {
  it('detecta que ya está elevado y no obliga a relanzar', async () => {
    const relaunch = vi.fn();
    const elevation = new ElevationRelaunch({ isElevated: vi.fn().mockResolvedValue(true), relaunch });

    await expect(elevation.isElevated()).resolves.toBe(true);
    expect(relaunch).not.toHaveBeenCalled();
  });

  it('si no está elevado, pide relaunch con exe real y args', async () => {
    const relaunch = vi.fn().mockResolvedValue(true);
    const elevation = new ElevationRelaunch({
      isElevated: vi.fn().mockResolvedValue(false),
      relaunch,
    });

    await expect(elevation.relaunch('D:\\GameClip-0.9.2.exe', ['--hidden'])).resolves.toBe(true);
    expect(relaunch).toHaveBeenCalledWith('D:\\GameClip-0.9.2.exe', ['--hidden']);
  });

  it('UAC cancelado o error conserva la instancia actual', async () => {
    const elevation = new ElevationRelaunch({
      isElevated: vi.fn().mockResolvedValue(false),
      relaunch: vi.fn().mockRejectedValue(new Error('cancelado')),
    });

    await expect(elevation.relaunch('D:\\GameClip-0.9.2.exe', [])).resolves.toBe(false);
  });
});
