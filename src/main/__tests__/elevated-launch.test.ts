import { describe, expect, it, vi } from 'vitest';
import {
  ELEVATED_TASK_NAME,
  ElevatedAutoLaunch,
  powershellElevatedArgs,
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
});
