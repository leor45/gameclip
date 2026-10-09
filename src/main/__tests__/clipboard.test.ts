import { describe, expect, it } from 'vitest';
import { copyFileToClipboard, setClipboardFileCommand } from '../export/clipboard';

describe('setClipboardFileCommand («Copiar» el último export)', () => {
  const base = { SystemRoot: 'C:\\Windows', Path: 'C:\\Windows\\System32' };

  it('la ruta viaja por el entorno, nunca dentro del script (regresión D4-BUG-4)', () => {
    // PowerShell trata ‘ ’ ‚ ‛ como comillas simples: con «Marvel’s…» en la ruta, la cadena del
    // script se cerraba antes de tiempo (ParserError «Falta la cadena en el terminador», medido) y
    // «Copiar» fallaba. Escapar solo la ' ASCII no basta; sin interpolar no hay nada que escapar.
    const ruta = "D:\\Clips\\Marvel’s Spider-Man 2\\clip ‘final’ ‚x‛ it's $(calc) `n.mp4";
    const { args, env } = setClipboardFileCommand(ruta, base);
    expect(args).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Set-Clipboard -LiteralPath $env:GAMECLIP_CLIP_PATH',
    ]);
    expect(env.GAMECLIP_CLIP_PATH).toBe(ruta);
  });

  it('conserva el resto del entorno sin modificar el de origen', () => {
    const { env } = setClipboardFileCommand('C:\\a.mp4', base);
    expect(env).toEqual({ ...base, GAMECLIP_CLIP_PATH: 'C:\\a.mp4' });
    expect(base).not.toHaveProperty('GAMECLIP_CLIP_PATH');
  });

  it('por defecto parte de process.env, sin escribir la variable en el proceso de la app', () => {
    const { env } = setClipboardFileCommand('C:\\a.mp4');
    expect(env).not.toBe(process.env);
    for (const [clave, valor] of Object.entries(process.env)) expect(env[clave]).toBe(valor);
    expect(process.env.GAMECLIP_CLIP_PATH).toBeUndefined();
  });
});

describe('copyFileToClipboard', () => {
  it('sin ruta o con un archivo que ya no existe devuelve false sin lanzar PowerShell', async () => {
    await expect(copyFileToClipboard(null)).resolves.toBe(false);
    await expect(copyFileToClipboard('Z:\\no-existe\\gameclip-clip.mp4')).resolves.toBe(false);
  });
});
