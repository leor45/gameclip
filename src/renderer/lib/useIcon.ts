import { useEffect, useState } from 'react';

/** Qué icono se pide: el de un juego por su nombre, o el de un ejecutable (apps, juegos manuales). */
export type IconKey = { game: string } | { exe: string };

// Caché de la sesión: una sola petición por clave, compartida por todos los que la pidan a la vez
// (la Biblioteca pinta decenas de tarjetas del mismo juego). Guarda la promesa, no el resultado,
// para que las peticiones simultáneas no se dupliquen.
const cache = new Map<string, Promise<string | null>>();

function claveDe(key: IconKey): string {
  return 'game' in key ? `game:${key.game.trim().toLowerCase()}` : `exe:${key.exe.trim().toLowerCase()}`;
}

/** Pide (o reutiliza) el icono. Nunca rechaza: cualquier fallo es «sin icono». */
export function loadIcon(key: IconKey): Promise<string | null> {
  const clave = claveDe(key);
  let promesa = cache.get(clave);
  if (!promesa) {
    const api = window.gameclip?.icons;
    const pedido = !api
      ? Promise.resolve(null)
      : 'game' in key
        ? api.forGame(key.game)
        : api.forExe(key.exe);
    promesa = pedido
      .then(
        (url) => (typeof url === 'string' && url.startsWith('data:image/') ? url : null),
        () => null,
      )
      .then((url) => {
        // «Sin icono» no se recuerda: el main puede conocer el ejecutable más tarde (p. ej. al
        // detectar el juego por primera vez) y la próxima vista que lo pida ya lo tendrá.
        if (url === null) cache.delete(clave);
        return url;
      });
    cache.set(clave, promesa);
  }
  return promesa;
}

/** Solo para tests: olvida la caché. */
export function clearIconCache(): void {
  cache.clear();
}

/**
 * Icono de un juego o ejecutable como data URL, o null (sin icono, todavía cargando o sin clave).
 * Con `key` null no pide nada.
 */
export function useIcon(key: IconKey | null): string | null {
  const clave = key ? claveDe(key) : null;
  const [estado, setEstado] = useState<{ clave: string | null; url: string | null }>({
    clave: null,
    url: null,
  });

  useEffect(() => {
    if (!key || !clave) return;
    let vivo = true;
    void loadIcon(key).then((url) => {
      if (vivo) setEstado({ clave, url });
    });
    return () => {
      vivo = false;
    };
    // `clave` resume `key`: así un objeto nuevo con el mismo contenido no vuelve a pedir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  return estado.clave === clave ? estado.url : null;
}
