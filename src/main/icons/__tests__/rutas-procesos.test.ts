import { describe, expect, it, vi } from 'vitest';
import {
  BuscadorRutas,
  CADUCIDAD_RUTA_MS,
  REINTENTO_RUTA_MS,
  argsRutasProcesos,
  claveConsultable,
  parsearRutas,
} from '../rutas-procesos';

/** Promesa controlable desde fuera. */
function diferida<T>() {
  let resolver!: (v: T) => void;
  const promesa = new Promise<T>((r) => (resolver = r));
  return { promesa, resolver };
}

/** Deja correr las microtareas pendientes. */
const vaciar = () => new Promise((r) => setTimeout(r, 0));

describe('consulta de rutas de procesos', () => {
  it('nunca lee módulos ni memoria: OpenProcess con 0x1000 + QueryFullProcessImageNameW', () => {
    const script = argsRutasProcesos()[3];
    expect(argsRutasProcesos().slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-Command']);
    expect(script).toContain('OpenProcess(0x1000');
    expect(script).toContain('QueryFullProcessImageNameW');
    expect(script).toContain('GetProcessesByName');
    // Lo que abre el proceso con PROCESS_VM_READ (Path = MainModule.FileName) o WMI: fuera.
    expect(script).not.toMatch(/Get-Process|MainModule|\.Path\b|Win32_Process|Get-CimInstance/);
    // Los nombres van por entorno, nunca interpolados.
    expect(script).toContain('$env:GAMECLIP_PROCESOS');
  });

  it('parsea un string suelto, una lista o basura (solo rutas absolutas de .exe)', () => {
    expect(parsearRutas('"C:\\\\A\\\\a.exe"')).toEqual(['C:\\A\\a.exe']);
    expect(parsearRutas('["C:\\\\A\\\\a.exe","D:\\\\b.exe","rel.exe","C:\\\\x.dll"]')).toEqual([
      'C:\\A\\a.exe',
      'D:\\b.exe',
    ]);
    expect(parsearRutas('')).toEqual([]);
    expect(parsearRutas('no es json')).toEqual([]);
  });

  it('solo consulta claves simples (sin comodines ni separadores)', () => {
    expect(claveConsultable('discord')).toBe(true);
    expect(claveConsultable('*')).toBe(false);
    expect(claveConsultable('a[b]')).toBe(false);
    expect(claveConsultable('c:\\x')).toBe(false);
    expect(claveConsultable('')).toBe(false);
  });
});

describe('BuscadorRutas', () => {
  it('como mucho UNA consulta en vuelo; lo que llega mientras tanto se agrupa en la siguiente', async () => {
    const consultas: { claves: string[]; d: ReturnType<typeof diferida<string[]>> }[] = [];
    const consultar = vi.fn((claves: string[]) => {
      const d = diferida<string[]>();
      consultas.push({ claves, d });
      return d.promesa;
    });
    const buscador = new BuscadorRutas({ consultar, esperar: () => Promise.resolve() });

    // 30 juegos a la vez (p. ej. la Biblioteca recién abierta): una sola consulta con todas las claves.
    const primeras = Array.from({ length: 30 }, (_, i) => buscador.buscar([`juego${i}`]));
    await vaciar();
    expect(consultar).toHaveBeenCalledTimes(1);
    expect(consultas[0].claves).toHaveLength(30);

    // Llegan más con la primera en vuelo: esperan, agrupadas en UNA siguiente.
    const tardias = [buscador.buscar(['otro1']), buscador.buscar(['otro2']), buscador.buscar(['juego3'])];
    await vaciar();
    expect(consultar).toHaveBeenCalledTimes(1);

    consultas[0].d.resolver(['D:\\Juegos\\juego3.exe']);
    await vaciar();
    expect(consultar).toHaveBeenCalledTimes(2);
    expect(consultas[1].claves.sort()).toEqual(['otro1', 'otro2']); // juego3 iba en la primera
    consultas[1].d.resolver([]);

    const res = await Promise.all([...primeras, ...tardias]);
    expect(res[3]).toEqual(['D:\\Juegos\\juego3.exe']);
    expect(res[30]).toEqual([]);
    expect(res[32]).toEqual(['D:\\Juegos\\juego3.exe']);
  });

  it('una clave sin resultado no se vuelve a consultar hasta REINTENTO_RUTA_MS', async () => {
    let t = 0;
    const consultar = vi.fn(async () => [] as string[]);
    const buscador = new BuscadorRutas({ consultar, ahora: () => t, esperar: async () => {} });
    expect(await buscador.buscar(['juego'])).toEqual([]);
    expect(await buscador.buscar(['juego'])).toEqual([]);
    expect(consultar).toHaveBeenCalledTimes(1);
    t += REINTENTO_RUTA_MS;
    consultar.mockResolvedValueOnce(['D:\\Juego\\juego.exe']);
    expect(await buscador.buscar(['juego'])).toEqual(['D:\\Juego\\juego.exe']);
    expect(consultar).toHaveBeenCalledTimes(2);
  });

  it('una ruta encontrada caduca: otro exe con el mismo nombre puede aparecer luego', async () => {
    let t = 0;
    const consultar = vi.fn(async () => ['D:\\A\\game.exe']);
    const buscador = new BuscadorRutas({ consultar, ahora: () => t, esperar: async () => {} });
    expect(await buscador.buscar(['game'])).toEqual(['D:\\A\\game.exe']);
    expect(await buscador.buscar(['game'])).toEqual(['D:\\A\\game.exe']);
    expect(consultar).toHaveBeenCalledTimes(1); // aún vigente

    t += CADUCIDAD_RUTA_MS;
    consultar.mockResolvedValueOnce(['E:\\B\\game.exe']);
    expect(await buscador.buscar(['game'])).toEqual(['E:\\B\\game.exe']);
  });

  it('devuelve todas las rutas de una clave (dos exes con el mismo nombre)', async () => {
    const buscador = new BuscadorRutas({
      consultar: async () => ['D:\\A\\game.exe', 'E:\\B\\game.exe'],
      esperar: async () => {},
    });
    expect(await buscador.buscar(['game'])).toEqual(['D:\\A\\game.exe', 'E:\\B\\game.exe']);
  });

  it('un error de la consulta es vacío, no una excepción', async () => {
    const buscador = new BuscadorRutas({
      consultar: async () => {
        throw new Error('powershell murió');
      },
      esperar: async () => {},
    });
    expect(await buscador.buscar(['x'])).toEqual([]);
  });
});
