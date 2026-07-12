import { execFile } from 'node:child_process';

/**
 * PowerShell → JSON. Lo usan las fuentes que leen el registro (GOG, Ubisoft/EA/Battle.net): `reg.exe`
 * escupe en la codepage de consola (850 en un Windows en español), así que un juego con acentos o `™`
 * saldría con mojibake. Forzando `OutputEncoding` a UTF-8 el nombre llega intacto.
 *
 * Solo se llama al construir el índice, nunca en el sondeo de procesos (ese sigue con `tasklist`).
 */
export async function powerShellJson<T>(script: string): Promise<T[]> {
  const envoltorio = `
    $ErrorActionPreference = 'Stop'
    [Console]::OutputEncoding = [Text.Encoding]::UTF8
    $datos = @(${script})
    ConvertTo-Json -InputObject $datos -Depth 3 -Compress
  `;

  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', envoltorio],
      { windowsHide: true, timeout: 20000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' },
      (err, out) => (err ? reject(err) : resolve(out)),
    );
  });

  const texto = stdout.trim();
  if (!texto || texto === 'null') return [];
  const parsed: unknown = JSON.parse(texto);
  // Con un solo elemento, ConvertTo-Json puede devolver el objeto suelto en vez de un array.
  return Array.isArray(parsed) ? (parsed as T[]) : [parsed as T];
}
