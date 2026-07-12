import { powerShellJson } from './powershell';

/**
 * `FileDescription` del ejecutable de un proceso en ejecución — el último recurso para nombrar un
 * juego que no conoce ningún launcher. Es sorprendentemente bueno: el `MilesMorales.exe` de Steam
 * declara literalmente `Marvel's Spider-Man: Miles Morales`.
 *
 * Se consulta **solo al dar de alta un juego a mano** (para pre-rellenar el nombre), nunca en el
 * sondeo: leerlo toca el disco y arranca PowerShell.
 */

const SCRIPT = (proceso: string) => `
  Get-Process -Name '${proceso}' -ErrorAction SilentlyContinue |
    Select-Object -First 1 |
    ForEach-Object {
      $fvi = $_.MainModule.FileVersionInfo
      [PSCustomObject]@{ description = $fvi.FileDescription; product = $fvi.ProductName }
    }
`;

interface Metadatos {
  description?: unknown;
  product?: unknown;
}

/** Nombre del proceso saneado: solo lo que puede llamarse un ejecutable (evita inyección en el script). */
function nombreDeProceso(executable: string): string | null {
  const base = executable.trim().split(/[\\/]/).pop() ?? '';
  const sinExe = base.replace(/\.exe$/i, '');
  return /^[\w.\- ]+$/.test(sinExe) ? sinExe : null;
}

/**
 * Nombre que declara el propio ejecutable, o null si no dice nada útil (muchos juegos dejan el campo
 * vacío) o si el proceso no está corriendo. Best-effort: cualquier fallo devuelve null.
 */
export async function nameFromExeMetadata(
  executable: string,
  run = powerShellJson,
): Promise<string | null> {
  const proceso = nombreDeProceso(executable);
  if (!proceso) return null;
  try {
    const [meta] = await run<Metadatos>(SCRIPT(proceso));
    if (!meta) return null;
    const description = typeof meta.description === 'string' ? meta.description.trim() : '';
    const product = typeof meta.product === 'string' ? meta.product.trim() : '';
    return description || product || null;
  } catch {
    return null;
  }
}
