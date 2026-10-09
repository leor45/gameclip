import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Secreto de desarrollo para `npm run dev:server` y los tests. Es público (está en el repo): solo vale
 * porque la API escucha en 127.0.0.1. La app empaquetada NUNCA lo usa: firma con `loadOrCreateSecret`.
 */
export const DEV_JWT_SECRET = 'gameclip-dev-secret';

/**
 * Secreto JWT propio de esta instalación: se genera la primera vez (48 bytes aleatorios en hex) y se
 * guarda en `file` (userData); las siguientes ejecuciones lo reutilizan. Borrar el fichero lo rota.
 */
export function loadOrCreateSecret(file: string): string {
  try {
    const guardado = readFileSync(file, 'utf8').trim();
    if (guardado) return guardado;
  } catch {
    // no existe todavía (primer arranque)
  }
  const secreto = randomBytes(48).toString('hex');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, secreto, 'utf8');
  return secreto;
}
