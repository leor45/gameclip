import { execFile } from 'node:child_process';
import { exeKey } from '@shared/games';
import { tieneControl } from './elegir';

/**
 * Rutas completas de procesos en ejecución, por clave `exeKey`. El sondeo de juegos usa `tasklist`,
 * que no da rutas, y no se le añade nada (corre cada 5 s mientras se juega). Las rutas llegan por dos
 * vías baratas:
 *
 *   - de paso: el listado de apps de audio (PowerShell, solo al abrir Ajustes → Audio) ya trae `Path`;
 *   - bajo demanda: cuando se pide el icono de algo que no tiene ruta conocida, UNA consulta a
 *     PowerShell por los nombres pedidos, con freno para no repetirla.
 *
 * Lo aprendido se recuerda toda la sesión: la ruta de un exe no cambia mientras la app está abierta
 * (y si cambia, la caché de iconos se invalida por la fecha del archivo).
 */

const rutasConocidas = new Map<string, string>();

/** Anota la ruta de un proceso visto en ejecución. Ignora rutas vacías o relativas. */
export function recordarRutaProceso(ruta: string | null | undefined): void {
  if (typeof ruta !== 'string') return;
  const limpia = ruta.trim();
  if (!/^[a-z]:[\\/]/i.test(limpia) || !/\.exe$/i.test(limpia)) return;
  rutasConocidas.set(exeKey(limpia), limpia);
}

/** Ruta conocida de un ejecutable (clave `exeKey`), o null. */
export function rutaConocida(clave: string): string | null {
  return rutasConocidas.get(clave.toLowerCase()) ?? null;
}

/** Solo para tests. */
export function olvidarRutasProcesos(): void {
  rutasConocidas.clear();
}

/**
 * Script de la consulta bajo demanda. Los nombres van por variable de entorno, NUNCA interpolados en
 * el comando: así un nombre raro no puede inyectar PowerShell.
 */
const PS_RUTAS =
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8; ' +
  "$n = $env:GAMECLIP_PROCESOS -split '\\|'; " +
  'Get-Process -Name $n -ErrorAction SilentlyContinue | Where-Object { $_.Path } | ' +
  'Select-Object -ExpandProperty Path | ConvertTo-Json -Compress';

/** Argumentos de powershell.exe para la consulta de rutas (puros, para testearlos). */
export function argsRutasProcesos(): string[] {
  return ['-NoProfile', '-NonInteractive', '-Command', PS_RUTAS];
}

/** Rutas de la salida JSON (un string suelto si solo hay una). */
export function parsearRutas(stdout: string): string[] {
  try {
    const parsed: unknown = JSON.parse(stdout.trim() || 'null');
    const lista = Array.isArray(parsed) ? parsed : [parsed];
    return lista.filter((r): r is string => typeof r === 'string' && r.trim() !== '');
  } catch {
    return [];
  }
}

/** Corre la consulta para unas claves y devuelve las rutas encontradas; inyectable para tests. */
export type ConsultarRutas = (claves: string[]) => Promise<string[]>;

export const consultarRutasPowerShell: ConsultarRutas = (claves) =>
  new Promise((resolve) => {
    // Solo nombres de archivo simples: `Get-Process -Name` acepta comodines y no queremos ninguno.
    const validas = claves.filter(
      (c) => c !== '' && !/[\\/:*?"<>|[\]]/.test(c) && !tieneControl(c),
    );
    if (validas.length === 0) {
      resolve([]);
      return;
    }
    execFile(
      'powershell.exe',
      argsRutasProcesos(),
      {
        timeout: 10000,
        windowsHide: true,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        env: { ...process.env, GAMECLIP_PROCESOS: validas.join('|') },
      },
      (err, stdout) => resolve(err ? [] : parsearRutas(stdout)),
    );
  });

/** Tras una consulta sin resultado, no se vuelve a preguntar por esa clave hasta pasado esto. */
export const REINTENTO_RUTA_MS = 60_000;

/**
 * Busca la ruta de procesos en ejecución bajo demanda, con freno por clave: una clave que no se
 * encontró no vuelve a consultarse en `REINTENTO_RUTA_MS`, y las consultas simultáneas por la misma
 * clave comparten la misma ejecución.
 */
export class BuscadorRutas {
  private readonly consultar: ConsultarRutas;
  private readonly ahora: () => number;
  private readonly fallidas = new Map<string, number>();
  private readonly enVuelo = new Map<string, Promise<string | null>>();

  constructor(consultar: ConsultarRutas = consultarRutasPowerShell, ahora: () => number = Date.now) {
    this.consultar = consultar;
    this.ahora = ahora;
  }

  /** Ruta del primer proceso en ejecución de esas claves (en su orden), o null. */
  async buscar(claves: string[]): Promise<string | null> {
    const unicas = [...new Set(claves.map((c) => c.toLowerCase()).filter(Boolean))];
    for (const clave of unicas) {
      const conocida = rutaConocida(clave);
      if (conocida) return conocida;
    }
    const t = this.ahora();
    const pendientes = unicas.filter((c) => {
      const fallo = this.fallidas.get(c);
      return fallo === undefined || t - fallo >= REINTENTO_RUTA_MS;
    });
    if (pendientes.length === 0) return null;

    const id = pendientes.join('|');
    let promesa = this.enVuelo.get(id);
    if (!promesa) {
      promesa = this.consultar(pendientes)
        .catch(() => [] as string[])
        .then((rutas) => {
          for (const ruta of rutas) recordarRutaProceso(ruta);
          const momento = this.ahora();
          for (const c of pendientes) if (!rutaConocida(c)) this.fallidas.set(c, momento);
          for (const c of pendientes) {
            const r = rutaConocida(c);
            if (r) return r;
          }
          return null;
        })
        .finally(() => this.enVuelo.delete(id));
      this.enVuelo.set(id, promesa);
    }
    return promesa;
  }
}
