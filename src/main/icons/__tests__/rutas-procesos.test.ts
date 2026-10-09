import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BuscadorRutas,
  REINTENTO_RUTA_MS,
  argsRutasProcesos,
  olvidarRutasProcesos,
  parsearRutas,
  recordarRutaProceso,
  rutaConocida,
} from '../rutas-procesos';

afterEach(() => olvidarRutasProcesos());

describe('rutas de procesos', () => {
  it('los nombres van por entorno, nunca interpolados en el comando', () => {
    const args = argsRutasProcesos();
    expect(args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-Command']);
    expect(args[3]).toContain('$env:GAMECLIP_PROCESOS');
  });

  it('parsea un string suelto, una lista o basura', () => {
    expect(parsearRutas('"C:\\\\A\\\\a.exe"')).toEqual(['C:\\A\\a.exe']);
    expect(parsearRutas('["C:\\\\A\\\\a.exe","D:\\\\b.exe"]')).toEqual(['C:\\A\\a.exe', 'D:\\b.exe']);
    expect(parsearRutas('')).toEqual([]);
    expect(parsearRutas('no es json')).toEqual([]);
  });

  it('solo recuerda rutas absolutas de .exe, por clave', () => {
    recordarRutaProceso('C:\\Apps\\Discord.exe');
    recordarRutaProceso('relativa\\x.exe');
    recordarRutaProceso(null);
    expect(rutaConocida('discord')).toBe('C:\\Apps\\Discord.exe');
    expect(rutaConocida('x')).toBeNull();
  });

  it('una ruta ya conocida no lanza consulta', async () => {
    recordarRutaProceso('C:\\Apps\\Discord.exe');
    const consultar = vi.fn(async () => []);
    expect(await new BuscadorRutas(consultar).buscar(['discord'])).toBe('C:\\Apps\\Discord.exe');
    expect(consultar).not.toHaveBeenCalled();
  });

  it('consultas simultáneas comparten ejecución; un fallo frena el reintento', async () => {
    let t = 0;
    const consultar = vi.fn(async () => [] as string[]);
    const buscador = new BuscadorRutas(consultar, () => t);
    const [a, b] = await Promise.all([buscador.buscar(['juego']), buscador.buscar(['juego'])]);
    expect([a, b]).toEqual([null, null]);
    expect(consultar).toHaveBeenCalledTimes(1);

    await buscador.buscar(['juego']);
    expect(consultar).toHaveBeenCalledTimes(1); // frenado

    t += REINTENTO_RUTA_MS;
    consultar.mockResolvedValueOnce(['D:\\Juego\\juego.exe']);
    expect(await buscador.buscar(['juego'])).toBe('D:\\Juego\\juego.exe');
    expect(consultar).toHaveBeenCalledTimes(2);
  });

  it('un error de la consulta es null, no una excepción', async () => {
    const buscador = new BuscadorRutas(async () => {
      throw new Error('powershell murió');
    });
    expect(await buscador.buscar(['x'])).toBeNull();
  });
});
