import type { GameNameContext } from '@shared/games';
import { KNOWN_GAME_PROCESSES, exeKey } from '@shared/games';
import { nameFromExeMetadata } from './exe-metadata';

/**
 * Nombre que la app propone al dar de alta un juego a mano, para no obligar al owner a teclearlo:
 * el del índice de launchers, el de la lista curada, o el que declare el propio `.exe`
 * (`MilesMorales.exe` dice `Marvel's Spider-Man: Miles Morales`).
 *
 * Null cuando no se deduce nada: el campo se queda vacío y el juego se llamará como su ejecutable,
 * exactamente como hasta ahora.
 */
export async function suggestGameName(
  executable: string,
  ctx: GameNameContext = {},
  metadata = nameFromExeMetadata,
): Promise<string | null> {
  const key = exeKey(executable);
  if (!key) return null;

  const conocido = ctx.index?.[key] ?? KNOWN_GAME_PROCESSES[key];
  if (conocido) return conocido;

  return metadata(executable);
}
