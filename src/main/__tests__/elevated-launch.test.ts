import { describe, expect, it, vi } from 'vitest';
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

describe('powershellElevatedArgs', () => {
  it('lanza schtasks elevado (RunAs), espera y propaga el exit code', () => {
    const args = powershellElevatedArgs('/Delete /TN X /F');
    const comando = args[args.length - 1];
    expect(args).toContain('-NoProfile');
    expect(comando).toContain('-Verb RunAs');
    expect(comando).toContain('-Wait');
    expect(comando).toContain("'/Delete /TN X /F'");
    expect(comando).toContain('exit $p.ExitCode');
  });

  it('escapa comillas simples del arg line', () => {
    const comando = powershellElevatedArgs("/TR \"C:\\D'Angelo\\app.exe\"").pop()!;
    expect(comando).toContain("D''Angelo");
  });
});

describe('powershellRelaunchElevatedArgs', () => {
  it('relanza el exe real como admin y conserva argumentos', () => {
    const args = powershellRelaunchElevatedArgs('D:\\Game Clip\\GameClip-0.9.2.exe', ['--hidden']);
    const comando = args.at(-1)!;
    expect(comando).toContain("Start-Process -FilePath 'D:\\Game Clip\\GameClip-0.9.2.exe'");
    expect(comando).toContain("-ArgumentList @('--hidden')");
    expect(comando).toContain('-Verb RunAs');
  });
});

describe('ElevatedAutoLaunch', () => {
  it('resuelve true cuando el run elevado termina bien', async () => {
    const run = vi.fn().mockResolvedValue(true);
    const launcher = new ElevatedAutoLaunch({ run });
    await expect(launcher.setEnabled(true, 'C:\\app.exe')).resolves.toBe(true);
    expect(run.mock.calls[0][0].join(' ')).toContain('/Create');
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
