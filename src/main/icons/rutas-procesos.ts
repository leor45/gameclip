import { execFile } from 'node:child_process';
import { exeKey } from '@shared/games';
import { tieneControl } from './elegir';

/**
 * Rutas completas de procesos en ejecución, por clave `exeKey`, para el servicio de iconos. El sondeo
 * de juegos usa `tasklist`, que no da rutas, y no se le añade nada (corre cada 5 s mientras se juega):
 * aquí se pregunta **bajo demanda**, solo cuando la UI pide el icono de algo sin ruta conocida.
 *
 * ## Nunca se lee la memoria ni los módulos del proceso
 *
 * Los juegos llevan anti-cheat (EAC, Vanguard, BattlEye…) y abrir su proceso con `PROCESS_VM_READ` es
 * un acceso que esos drivers vigilan. `Get-Process … | Select Path` (PowerShell 5.1) NO vale: `Path`
 * es `MainModule.FileName`, que llama a `EnumProcessModules`/`GetModuleFileNameEx` y abre el proceso
 * con `PROCESS_QUERY_INFORMATION | PROCESS_VM_READ`. `Win32_Process.ExecutablePath` (CIM) tampoco se
 * usa: el proveedor de WMI no documenta con qué derechos abre el proceso, así que no se puede
 * garantizar.
 *
 * Lo que se hace, y solo esto:
 *   1. `[Diagnostics.Process]::GetProcessesByName(n)` y su `.Id`: en .NET Framework sale de la
 *      instantánea de `NtQuerySystemInformation(SystemProcessInformation)`, sin abrir ningún proceso
 *      (es lo que hace `tasklist`). No se toca ninguna otra propiedad del objeto `Process`.
 *   2. `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION = 0x1000, …)` + `QueryFullProcessImageNameW`,
 *      que según la documentación de Win32 solo exige ese derecho (el mismo que usa el Administrador de
 *      tareas con cualquier proceso, protegidos incluidos) y lee la ruta de la imagen desde el kernel,
 *      no de la memoria del proceso. El handle se cierra enseguida.
 *
 * ## Freno
 *
 * Como mucho UNA consulta (un `powershell.exe`) en vuelo a la vez. Las claves que llegan mientras
 * tanto se agrupan en la siguiente (hasta `MAX_CLAVES_LOTE` por consulta), que arranca cuando la
 * actual termina (y tras una ventana breve para juntar las peticiones de una misma pantalla). Una clave sin resultado no se vuelve a consultar
 * en `REINTENTO_RUTA_MS`, y una ruta encontrada caduca a los `CADUCIDAD_RUTA_MS`: otro proceso con el
 * mismo nombre de exe puede aparecer luego.
 */

/** C# del P/Invoke, en una línea (va dentro de un string de PowerShell entre comillas simples). */
const CS_RUTA =
  'using System; using System.Runtime.InteropServices; using System.Text; ' +
  'public static class GameClipRutaProceso { ' +
  '[DllImport("kernel32.dll", SetLastError = true)] ' +
  'static extern IntPtr OpenProcess(uint acceso, bool heredar, uint pid); ' +
  '[DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode, EntryPoint = "QueryFullProcessImageNameW")] ' +
  'static extern bool QueryFullProcessImageName(IntPtr h, uint flags, StringBuilder ruta, ref uint tam); ' +
  '[DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h); ' +
  'public static string De(uint pid) { ' +
  'IntPtr h = OpenProcess(0x1000, false, pid); ' + // PROCESS_QUERY_LIMITED_INFORMATION, nada más
  'if (h == IntPtr.Zero) return null; ' +
  'try { StringBuilder sb = new StringBuilder(1024); uint n = 1024; ' +
  'return QueryFullProcessImageName(h, 0, sb, ref n) ? sb.ToString() : null; } ' +
  'finally { CloseHandle(h); } } }';

/**
 * Script de la consulta. Los nombres van por variable de entorno, NUNCA interpolados en el comando:
 * así un nombre raro no puede inyectar PowerShell.
 */
const PS_RUTAS =
  "$ErrorActionPreference = 'SilentlyContinue'; " +
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8; ' +
  `Add-Type -TypeDefinition '${CS_RUTA}'; ` +
  '$rutas = foreach ($n in ($env:GAMECLIP_PROCESOS -split "\\|")) { ' +
  'foreach ($p in [Diagnostics.Process]::GetProcessesByName($n)) { ' +
  '[GameClipRutaProceso]::De([uint32]$p.Id) } }; ' +
  '@($rutas | Where-Object { $_ }) | ConvertTo-Json -Compress';

/** Argumentos de powershell.exe para la consulta de rutas (puros, para testearlos). */
export function argsRutasProcesos(): string[] {
  return ['-NoProfile', '-NonInteractive', '-Command', PS_RUTAS];
}

/** Rutas de la salida JSON (un string suelto si solo hay una). Solo absolutas y `.exe`. */
export function parsearRutas(stdout: string): string[] {
  try {
    const parsed: unknown = JSON.parse(stdout.trim() || 'null');
    const lista = Array.isArray(parsed) ? parsed : [parsed];
    return lista
      .filter((r): r is string => typeof r === 'string')
      .map((r) => r.trim())
      .filter((r) => /^[a-z]:[\\/]/i.test(r) && /\.exe$/i.test(r));
  } catch {
    return [];
  }
}

/** ¿Clave apta para `GetProcessesByName`? Nombre de archivo simple, sin comodines ni separadores. */
export function claveConsultable(clave: string): boolean {
  return clave !== '' && !/[\\/:*?"<>|[\]]/.test(clave) && !tieneControl(clave);
}

/** Corre la consulta para unas claves y devuelve las rutas encontradas; inyectable para tests. */
export type ConsultarRutas = (claves: string[]) => Promise<string[]>;

export const consultarRutasPowerShell: ConsultarRutas = (claves) =>
  new Promise((resolve) => {
    const validas = claves.filter(claveConsultable);
    if (validas.length === 0) {
      resolve([]);
      return;
    }
    execFile(
      'powershell.exe',
      argsRutasProcesos(),
      {
        timeout: 15000,
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
/** Una ruta encontrada vale este tiempo; después se vuelve a preguntar. */
export const CADUCIDAD_RUTA_MS = 5 * 60_000;
/** Ventana para juntar en una sola consulta las claves que llegan casi a la vez. */
export const VENTANA_LOTE_MS = 50;

/** Tope de claves por consulta: van en una variable de entorno y el bloque de entorno tiene límite. */
export const MAX_CLAVES_LOTE = 64;
/** Tope de claves recordadas (encontradas y fallidas); al pasarlo se olvida la más antigua. */
export const MAX_RECORDADAS = 1000;

export interface OpcionesBuscador {
  consultar?: ConsultarRutas;
  ahora?: () => number;
  esperar?: (ms: number) => Promise<void>;
}

/** Mete en un Map con tope: reinserta al final (más reciente) y descarta lo más antiguo. */
function ponerConTope<V>(mapa: Map<string, V>, clave: string, valor: V): void {
  mapa.delete(clave);
  mapa.set(clave, valor);
  while (mapa.size > MAX_RECORDADAS) {
    const masAntigua = mapa.keys().next().value;
    if (masAntigua === undefined) break;
    mapa.delete(masAntigua);
  }
}

/**
 * Busca rutas de procesos en ejecución con una sola consulta en vuelo y claves agrupadas.
 *
 * Una cola de claves y un único «trabajador»: mientras haya claves en cola, espera la ventana, saca
 * hasta `MAX_CLAVES_LOTE` y las consulta; las demás esperan al siguiente lote. Cada clave en cola o
 * en vuelo tiene una espera compartida, así que pedirla dos veces no la consulta dos veces. Nada de
 * esto rechaza nunca: un fallo de la consulta (síncrono o no) cuenta como «no encontrada».
 */
export class BuscadorRutas {
  private readonly consultar: ConsultarRutas;
  private readonly ahora: () => number;
  private readonly esperar: (ms: number) => Promise<void>;
  /** Rutas encontradas por clave, con su fecha (caducan). */
  private readonly conocidas = new Map<string, { rutas: string[]; en: number }>();
  private readonly fallidas = new Map<string, number>();
  /** Claves pendientes de consultar, en orden de llegada. */
  private readonly cola = new Set<string>();
  /** Espera de cada clave en cola o en vuelo (se resuelve cuando su consulta termina). */
  private readonly esperas = new Map<string, { promesa: Promise<void>; resolver: () => void }>();
  private trabajando = false;

  constructor(opciones: OpcionesBuscador = {}) {
    this.consultar = opciones.consultar ?? consultarRutasPowerShell;
    this.ahora = opciones.ahora ?? Date.now;
    this.esperar = opciones.esperar ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /**
   * Rutas de los procesos en ejecución de esas claves (en su orden; puede haber varias por clave si
   * corren dos exes con el mismo nombre). Vacío si no corre ninguno. Nunca rechaza.
   */
  async buscar(claves: string[]): Promise<string[]> {
    const unicas = [...new Set(claves.map((c) => c.toLowerCase()).filter(claveConsultable))];
    const t = this.ahora();
    const pendientes = unicas.filter((c) => {
      const conocida = this.conocidas.get(c);
      if (conocida && t - conocida.en < CADUCIDAD_RUTA_MS) return false;
      const fallo = this.fallidas.get(c);
      return fallo === undefined || t - fallo >= REINTENTO_RUTA_MS;
    });

    if (pendientes.length > 0) {
      const esperas = pendientes.map((c) => {
        let espera = this.esperas.get(c);
        if (!espera) {
          let resolver: () => void = () => {};
          const promesa = new Promise<void>((r) => (resolver = r));
          espera = { promesa, resolver };
          this.esperas.set(c, espera);
          this.cola.add(c);
        }
        return espera.promesa;
      });
      if (!this.trabajando) void this.trabajar();
      await Promise.all(esperas);
    }

    const ahora = this.ahora();
    return unicas.flatMap((c) => {
      const conocida = this.conocidas.get(c);
      return conocida && ahora - conocida.en < CADUCIDAD_RUTA_MS ? conocida.rutas : [];
    });
  }

  /** El único trabajador: un lote a la vez hasta vaciar la cola. Nunca rechaza ni deja esperas colgadas. */
  private async trabajar(): Promise<void> {
    this.trabajando = true;
    try {
      while (this.cola.size > 0) {
        try {
          await this.esperar(VENTANA_LOTE_MS);
        } catch {
          // sin ventana: se consulta ya
        }
        const lote = [...this.cola].slice(0, MAX_CLAVES_LOTE);
        for (const c of lote) this.cola.delete(c);
        try {
          await this.ejecutar(lote);
        } catch {
          // la consulta falló entera: esas claves cuentan como no encontradas
          const momento = this.ahora();
          for (const c of lote) ponerConTope(this.fallidas, c, momento);
        } finally {
          for (const c of lote) {
            this.esperas.get(c)?.resolver();
            this.esperas.delete(c);
          }
        }
      }
    } finally {
      this.trabajando = false;
    }
  }

  private async ejecutar(claves: string[]): Promise<void> {
    // `Promise.resolve().then`: un `consultar` que lanza en síncrono también acaba en el catch.
    const rutas = await Promise.resolve()
      .then(() => this.consultar(claves))
      .catch(() => [] as string[]);
    const momento = this.ahora();
    const porClave = new Map<string, string[]>();
    for (const ruta of Array.isArray(rutas) ? rutas : []) {
      if (typeof ruta !== 'string') continue;
      const clave = exeKey(ruta);
      porClave.set(clave, [...(porClave.get(clave) ?? []), ruta]);
    }
    for (const clave of claves) {
      const encontradas = porClave.get(clave);
      if (encontradas) {
        ponerConTope(this.conocidas, clave, { rutas: [...new Set(encontradas)], en: momento });
        this.fallidas.delete(clave);
      } else {
        this.conocidas.delete(clave);
        ponerConTope(this.fallidas, clave, momento);
      }
    }
  }
}
