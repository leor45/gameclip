import { useState } from 'react';
import type { Clip } from '@shared/library';

/**
 * Acciones que comparten la tarjeta y el panel reproductor: favorito y renombrar/etiquetar, con el
 * estado «ocupado» que desactiva los botones mientras el main responde. Eliminar no está aquí: lo
 * confirma la Biblioteca con su modal (un solo diálogo para tarjetas y panel).
 */
export function useClipAcciones(clip: Clip) {
  const [ocupado, setOcupado] = useState(false);

  async function accion(fn: () => Promise<unknown>) {
    setOcupado(true);
    try {
      await fn();
    } finally {
      setOcupado(false);
    }
  }

  return {
    ocupado,
    alternarFavorito: () =>
      void accion(() => window.gameclip.library.update(clip.id, { favorite: !clip.favorite })),
    guardar: (titulo: string, tags: string) =>
      accion(() =>
        window.gameclip.library.update(clip.id, {
          title: titulo,
          tags: tags.split(',').map((t) => t.trim()),
        }),
      ),
  };
}
