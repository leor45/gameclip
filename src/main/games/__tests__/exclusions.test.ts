import { describe, expect, it, vi } from 'vitest';
import type { ExcludedGame } from '@shared/games';
import { setExcludedAndRefresh, type SetExcludedDeps } from '../exclusions';

const manual = (name: string, enabled = true): ExcludedGame => ({ name, source: 'manual', enabled });
const auto = (name: string, enabled = true): ExcludedGame => ({ name, source: 'auto', enabled });

/** Almacén de ajustes de mentira: `guardar` y `leer` comparten la misma lista. */
function almacen(inicial: ExcludedGame[] = []) {
  let guardada = inicial;
  return {
    guardar: vi.fn((lista: ExcludedGame[]) => {
      guardada = lista;
      return { excludedGames: guardada };
    }),
    leer: () => ({ excludedGames: guardada }),
    /** Lo que hace la sincronización del refresco: reescribe la lista en segundo plano. */
    sincronizar: (lista: ExcludedGame[]) => {
      guardada = lista;
    },
  };
}

describe('setExcludedAndRefresh', () => {
  it('devuelve la lista posterior al refresco, no la calculada antes (regresión Bug 5)', async () => {
    // El refresco corre `sincronizarExclusiones`, que puede añadir las apps conocidas instaladas o
    // quitar las automáticas desinstaladas. La respuesta vieja pisaba en la UI esa lista nueva.
    const ajustes = almacen();
    const deps: SetExcludedDeps = {
      ...ajustes,
      refrescar: () => {
        ajustes.sincronizar([manual('Mi App'), auto('Wallpaper Engine')]);
        return Promise.resolve();
      },
    };

    expect(await setExcludedAndRefresh([manual('Mi App')], deps)).toEqual([
      manual('Mi App'),
      auto('Wallpaper Engine'),
    ]);
    expect(ajustes.guardar).toHaveBeenCalledWith([manual('Mi App')]);
  });

  it('guarda antes de refrescar (el refresco ve la lista nueva)', async () => {
    const ajustes = almacen();
    const vista: ExcludedGame[][] = [];
    await setExcludedAndRefresh([manual('Mi App')], {
      ...ajustes,
      refrescar: () => {
        vista.push(ajustes.leer().excludedGames);
        return Promise.resolve();
      },
    });
    expect(vista).toEqual([[manual('Mi App')]]);
  });

  it('si el refresco rechaza, no rechaza: lo guardado está guardado', async () => {
    const ajustes = almacen();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const deps: SetExcludedDeps = {
        ...ajustes,
        refrescar: () => Promise.reject(new Error('launcher roto')),
      };
      await expect(setExcludedAndRefresh([manual('Mi App')], deps)).resolves.toEqual([
        manual('Mi App'),
      ]);
      expect(error).toHaveBeenCalledOnce();
    } finally {
      error.mockRestore();
    }
  });

  it('si el refresco lanza en síncrono, tampoco rechaza', async () => {
    const ajustes = almacen();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const deps: SetExcludedDeps = {
        ...ajustes,
        refrescar: () => {
          throw new Error('launcher roto');
        },
      };
      await expect(setExcludedAndRefresh([manual('Mi App')], deps)).resolves.toEqual([
        manual('Mi App'),
      ]);
    } finally {
      error.mockRestore();
    }
  });

  it('si el guardado falla, rechaza y no refresca (nada que refrescar)', async () => {
    const refrescar = vi.fn(() => Promise.resolve());
    const deps: SetExcludedDeps = {
      guardar: () => {
        throw new Error('disco lleno');
      },
      refrescar,
      leer: () => ({ excludedGames: [] }),
    };
    await expect(setExcludedAndRefresh([manual('Mi App')], deps)).rejects.toThrow('disco lleno');
    expect(refrescar).not.toHaveBeenCalled();
  });
});
