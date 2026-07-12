import { useCallback, useEffect, useState } from 'react';
import type { Clip } from '@shared/library';
import { DESKTOP_FILTER_VALUE } from '@shared/library';
import ClipCard from '../components/ClipCard';
import ClipPlayer from '../components/ClipPlayer';
import { useThumbnailer } from '../lib/useThumbnailer';

export default function Biblioteca() {
  const [clips, setClips] = useState<Clip[] | null>(null);
  const [juegos, setJuegos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [soloFavoritos, setSoloFavoritos] = useState(false);
  const [juego, setJuego] = useState('');
  const [reproduciendo, setReproduciendo] = useState<Clip | null>(null);

  // El desplegable mezcla juegos con un criterio que NO es un juego (escritorio = sin juego): el
  // centinela se traduce aquí y al catálogo le cruza `withoutGame`, no la cadena.
  const cargar = useCallback(async () => {
    try {
      const esEscritorio = juego === DESKTOP_FILTER_VALUE;
      const [lista, listaJuegos] = await Promise.all([
        window.gameclip.library.list({
          search: busqueda || undefined,
          favoritesOnly: soloFavoritos,
          game: esEscritorio ? undefined : juego || undefined,
          withoutGame: esEscritorio,
        }),
        window.gameclip.library.games(),
      ]);
      setClips(lista);
      setJuegos(listaJuegos);
      setError(null);
    } catch (err) {
      setClips([]);
      setError(err instanceof Error ? err.message : 'No se pudo cargar la biblioteca.');
    }
  }, [busqueda, soloFavoritos, juego]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Push del main: cualquier mutación del catálogo recarga la vista.
  useEffect(() => window.gameclip.library.onChanged(() => void cargar()), [cargar]);

  useThumbnailer(clips);

  const hayFiltros = Boolean(busqueda || soloFavoritos || juego);

  return (
    <section className="library">
      <div className="library-head">
        <h1>Biblioteca</h1>
        <div className="library-filters">
          <input
            type="search"
            aria-label="Buscar clips"
            placeholder="Buscar por título, juego o etiqueta…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <button
            type="button"
            className={soloFavoritos ? 'chip on' : 'chip'}
            aria-pressed={soloFavoritos}
            onClick={() => setSoloFavoritos((v) => !v)}
          >
            ★ Favoritos
          </button>
          <select
            aria-label="Filtrar por juego"
            value={juego}
            onChange={(e) => setJuego(e.target.value)}
          >
            <option value="">Todos los juegos</option>
            <option value={DESKTOP_FILTER_VALUE}>Escritorio</option>
            {juegos.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="library-error">{error}</p>}

      {clips && clips.length === 0 && !error && (
        <p className="placeholder">
          {hayFiltros
            ? 'Sin resultados con estos filtros.'
            : 'Aún no hay clips. Guarda uno con el hotkey de replay (F8) o grabando desde la barra superior.'}
        </p>
      )}

      {clips && clips.length > 0 && (
        <div className="library-grid">
          {clips.map((clip) => (
            <ClipCard key={clip.id} clip={clip} onPlay={setReproduciendo} />
          ))}
        </div>
      )}

      {reproduciendo && (
        <ClipPlayer clip={reproduciendo} onClose={() => setReproduciendo(null)} />
      )}
    </section>
  );
}
