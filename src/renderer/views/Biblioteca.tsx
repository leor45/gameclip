import { useCallback, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import type { LibraryGameStats } from '@shared/ipc';
import type { Clip } from '@shared/library';
import { DESKTOP_FILTER_VALUE } from '@shared/library';
import ClipCard, { selloDe } from '../components/ClipCard';
import ClipPlayer from '../components/ClipPlayer';
import ConfirmDialog from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import { abrirEditor } from '../components/library/ClipActions';
import ClipRows from '../components/library/ClipRows';
import GameFilter from '../components/library/GameFilter';
import GameLine from '../components/library/GameLine';
import { SearchGlyph } from '../components/library/glyphs';
import { clipsLabel, groupByDate } from '../lib/libraryGroups';
import { thumbMediaUrl } from '../lib/media';
import { useThumbnailer } from '../lib/useThumbnailer';

/** ¿El foco está escribiendo? Ahí ↑ ↓, Intro y Esc son del campo, no de la vista. */
function esCampoDeTexto(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'radio', 'submit', 'reset'].includes(el.type);
  }
  return false;
}

/** Resumen del clip en los modales de eliminar: miniatura, título, juego y duración. */
function ResumenClip({ clip }: { clip: Clip }) {
  const poster = clip.thumbnailPath ? thumbMediaUrl(clip.id, clip.thumbnailPath) : undefined;
  return (
    <div className="lib-del-what">
      <span className="lib-del-thumb">{poster && <img src={poster} alt="" />}</span>
      <span className="lib-del-text">
        <b>{clip.title}</b>
        <span className="lib-del-meta">
          <GameLine game={clip.game} />
          <span aria-hidden="true">·</span>
          <span>{selloDe(clip)}</span>
        </span>
      </span>
    </div>
  );
}

export default function Biblioteca() {
  const [clips, setClips] = useState<Clip[] | null>(null);
  const [stats, setStats] = useState<LibraryGameStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [soloFavoritos, setSoloFavoritos] = useState(false);
  const [juego, setJuego] = useState('');
  // Clip abierto en el panel. Se guarda el id (no el objeto): cada recarga trae el clip al día
  // (favorito, título) y, si deja de estar en la lista, el panel se cierra.
  const [abiertoId, setAbiertoId] = useState<number | null>(null);
  // Qué tarjeta previsualiza. Vive aquí (y no en cada tarjeta) para que solo haya UNA preview
  // viva: la app corre mientras se juega y no puede quedarse decodificando videos olvidados.
  const [preview, setPreview] = useState<number | null>(null);
  // Eliminar: el clip a confirmar, si el borrado está en curso y el error si falló.
  const [aBorrar, setABorrar] = useState<Clip | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<{ clip: Clip; mensaje: string } | null>(null);

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
      // El juego filtrado ya no tiene clips (se borró el último): el desplegable no tendría opción
      // para él y el filtro seguiría aplicado sin que se viera. Se suelta el filtro y se recarga.
      if (juego && !esEscritorio && !listaJuegos.includes(juego)) {
        setJuego('');
        return;
      }
      setClips(lista);
      setError(null);
    } catch (err) {
      setClips([]);
      setError(err instanceof Error ? err.message : 'No se pudo cargar la biblioteca.');
    }
  }, [busqueda, soloFavoritos, juego]);

  // Contadores del filtro de juego (todo el catálogo, sin filtros). Si fallan, el desplegable
  // funciona igual sin números: no es motivo para tapar la biblioteca con un error.
  const cargarStats = useCallback(async () => {
    try {
      setStats(await window.gameclip.library.gameStats());
    } catch {
      /* sin contadores */
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    void cargarStats();
  }, [cargarStats]);

  // Push del main: cualquier mutación del catálogo recarga la vista y los contadores.
  useEffect(
    () =>
      window.gameclip.library.onChanged(() => {
        void cargar();
        void cargarStats();
      }),
    [cargar, cargarStats],
  );

  useThumbnailer(clips);

  const grupos = useMemo(() => groupByDate(clips ?? []), [clips]);
  // Orden visual (el de los grupos): ↑ ↓ recorren la lista tal como se ve.
  const enOrden = useMemo(() => grupos.flatMap((g) => g.items), [grupos]);
  const abierto = abiertoId === null ? null : (enOrden.find((c) => c.id === abiertoId) ?? null);

  // El clip abierto se borró o salió del listado (filtro, búsqueda): el panel se cierra.
  useEffect(() => {
    if (abiertoId !== null && clips && !clips.some((c) => c.id === abiertoId)) setAbiertoId(null);
  }, [clips, abiertoId]);

  const abrir = useCallback((clip: Clip) => {
    setPreview(null); // con el panel abierto no hay cuadrícula ni vista previa
    setAbiertoId(clip.id);
  }, []);

  // Teclado del panel: Esc cierra, ↑ ↓ cambian de clip, Intro abre el editor. Con un modal abierto
  // no se atiende nada (el modal además se queda el Esc en captura).
  const hayModal = aBorrar !== null || errorBorrado !== null;
  useEffect(() => {
    if (abiertoId === null || hayModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
      const objetivo = e.target;
      if (esCampoDeTexto(objetivo)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setAbiertoId(null);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // El vídeo con foco usa las flechas para sus propios controles.
        if (objetivo instanceof HTMLMediaElement) return;
        const i = enOrden.findIndex((c) => c.id === abiertoId);
        const j = i + (e.key === 'ArrowDown' ? 1 : -1);
        e.preventDefault();
        if (i >= 0 && j >= 0 && j < enOrden.length) setAbiertoId(enOrden[j].id);
      } else if (e.key === 'Enter') {
        // Intro sobre un botón es el clic de ese botón; solo las filas del índice lo ceden.
        if (
          objetivo instanceof HTMLElement &&
          objetivo.closest('button, a, video') &&
          !objetivo.closest('.lib-row')
        ) {
          return;
        }
        const clip = enOrden.find((c) => c.id === abiertoId);
        if (!clip || clip.kind === 'image') return;
        e.preventDefault();
        abrirEditor(clip.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [abiertoId, enOrden, hayModal]);

  function pedirBorrado(clip: Clip) {
    setErrorBorrado(null);
    setABorrar(clip);
  }

  async function confirmarBorrado() {
    const clip = aBorrar;
    if (!clip) return;
    // Soltar la preview y cerrar el panel desmonta el <video>, que es lo que en Windows tiene el
    // archivo abierto e impide borrarlo. flushSync: que se desmonte ANTES de pedir el borrado.
    // Cerrar el handle es asíncrono; el main además reintenta el borrado.
    flushSync(() => {
      setPreview((p) => (p === clip.id ? null : p));
      setAbiertoId((id) => (id === clip.id ? null : id));
      setBorrando(true);
    });
    try {
      await window.gameclip.library.remove(clip.id);
      setABorrar(null);
    } catch (err) {
      setABorrar(null);
      setErrorBorrado({
        clip,
        mensaje: err instanceof Error ? err.message : 'No se pudo borrar el clip.',
      });
    } finally {
      setBorrando(false);
    }
  }

  const hayFiltros = Boolean(busqueda || soloFavoritos || juego);
  const contador =
    clips === null
      ? null
      : hayFiltros
        ? `${clips.length} de ${stats?.total ?? '…'}`
        : clipsLabel(clips.length);

  return (
    <section className={abierto ? 'library open' : 'library'}>
      <div className="library-head">
        <h1 className="gc-display">Biblioteca</h1>
        <div className="library-filters">
          <label className="library-search">
            <SearchGlyph />
            <input
              type="search"
              aria-label="Buscar clips"
              placeholder="Buscar por título, juego o etiqueta…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </label>
          <GameFilter value={juego} onChange={setJuego} stats={stats} />
          <button
            type="button"
            className={soloFavoritos ? 'chip on' : 'chip'}
            aria-pressed={soloFavoritos}
            onClick={() => setSoloFavoritos((v) => !v)}
          >
            ★ Favoritos
          </button>
          {contador && (
            <span className="library-count" aria-live="polite">
              {contador}
            </span>
          )}
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

      {clips && clips.length > 0 && abierto && (
        <div className="library-body split">
          <ClipPlayer
            key={abierto.id}
            clip={abierto}
            onClose={() => setAbiertoId(null)}
            onEliminar={pedirBorrado}
          />
          <ClipRows grupos={grupos} abiertoId={abierto.id} onAbrir={abrir} />
        </div>
      )}

      {clips && clips.length > 0 && !abierto && (
        <div className="library-body">
          {grupos.map((g) => (
            <section key={g.key} className="library-group" aria-label={g.label}>
              <h2 className="library-group-head">
                {g.label}
                <span>{clipsLabel(g.items.length)}</span>
              </h2>
              <div className="library-grid">
                {g.items.map((clip) => (
                  <ClipCard
                    key={clip.id}
                    clip={clip}
                    onPlay={abrir}
                    onEliminar={pedirBorrado}
                    previewActiva={preview === clip.id}
                    // Apagar solo apaga LA PROPIA: un mouseleave tardío de otra tarjeta no puede
                    // matar la preview de la que el cursor ya está apuntando.
                    onPreviewChange={(activa) =>
                      setPreview((actual) =>
                        activa ? clip.id : actual === clip.id ? null : actual,
                      )
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {aBorrar && (
        <ConfirmDialog
          danger
          title="¿Eliminar el clip?"
          confirmLabel="Eliminar"
          busy={borrando}
          onConfirm={() => void confirmarBorrado()}
          onCancel={() => setABorrar(null)}
        >
          <ResumenClip clip={aBorrar} />
          <p>
            {aBorrar.kind === 'image'
              ? 'La imagen también se borra del disco.'
              : 'El archivo de vídeo también se borra del disco.'}
          </p>
        </ConfirmDialog>
      )}

      {errorBorrado && (
        <Modal
          role="alertdialog"
          title="No se pudo eliminar"
          mark={<span className="gc-modal-mark">×</span>}
          onDismiss={() => setErrorBorrado(null)}
          actions={
            <button
              type="button"
              className="gc-btn"
              data-autofocus=""
              onClick={() => setErrorBorrado(null)}
            >
              Entendido
            </button>
          }
        >
          <ResumenClip clip={errorBorrado.clip} />
          <p>{errorBorrado.mensaje}</p>
        </Modal>
      )}
    </section>
  );
}
