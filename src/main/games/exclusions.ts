import type { ExcludedGame } from '@shared/games';

/** Lo que `setExcludedAndRefresh` necesita del almacén de ajustes y del índice. */
export interface SetExcludedDeps {
  /** Guarda la lista y avisa a la UI. Si falla, lanza. */
  guardar: (lista: ExcludedGame[]) => unknown;
  /** Refresca el índice de juegos (corre la sincronización de exclusiones). */
  refrescar: () => Promise<unknown>;
  /** Lee los ajustes tal y como están ahora en el almacén. */
  leer: () => { excludedGames: ExcludedGame[] };
}

/**
 * `setExcluded` del IPC: guarda la lista, refresca el índice y devuelve la lista **posterior** al
 * refresco.
 *
 * Se lee del almacén tras refrescar porque el refresco corre `sincronizarExclusiones`, que puede
 * reescribir la lista (añadir las apps conocidas instaladas, quitar las automáticas desinstaladas) y
 * mandarla por `SettingsChanged`: devolver la calculada antes haría que la UI la pisara con una vieja.
 *
 * Un refresco que falla no hace fallar la llamada: la lista ya está guardada, y rechazar dejaba a la
 * UI con la optimista y un rechazo sin capturar. El fallo se registra y se devuelve lo que hay guardado.
 * Si falla el guardado en sí, sí rechaza (no hay nada que devolver).
 */
export async function setExcludedAndRefresh(
  lista: ExcludedGame[],
  deps: SetExcludedDeps,
): Promise<ExcludedGame[]> {
  deps.guardar(lista);
  try {
    await deps.refrescar();
  } catch (err) {
    console.error('[games] el refresco tras cambiar «no son juegos» falló:', err);
  }
  return deps.leer().excludedGames;
}
