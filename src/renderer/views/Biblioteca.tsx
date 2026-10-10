import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

/** Retardo con el que se agrupan las ráfagas de cambios del catálogo antes de pedir los contadores. */
const STATS_DEBOUNCE_MS = 300;

/** Medianoche local de hoy (ms): cambia una vez al día y marca cuándo recalcular «Hoy»/«Ayer». */
function hoyLocal(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** ¿Hay un modal abierto (propio o de otra parte de la app)? Entonces el teclado es suyo. */
function hayModalAbierto(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
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
  // La cuadrícula sigue montada (oculta) con el panel abierto: no se re-montan cientos de tarjetas
  // al cerrar. Aun así, `display: none` puede perder el scroll: se guarda al abrir y se restaura al
  // cerrar, junto con el foco en la tarjeta del clip que estaba abierto.
  const rejilla = useRef<HTMLDivElement>(null);
  const scrollRejilla = useRef(0);
  const alCerrar = useRef<{ id: number; foco: boolean } | null>(null);
  // Día en curso: «Hoy»/«Ayer» se recalculan al pasar la medianoche aunque no cambien los clips.
  const [dia, setDia] = useState(hoyLocal);
  // Filtros con los que se ve la lista (para saber al cerrar el panel si sigue siendo la misma).
  const claveFiltros = useRef('');
  const filtrosAlAbrir = useRef('');

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
  // Guarda de carrera: solo cuenta la respuesta de la ÚLTIMA petición (una vieja que llega tarde
  // pisaría contadores más nuevos).
  const pedidoStats = useRef(0);
  const cargarStats = useCallback(async () => {
    const yo = ++pedidoStats.current;
    try {
      const nuevas = await window.gameclip.library.gameStats();
      if (yo === pedidoStats.current) setStats(nuevas);
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

  // Los contadores recorren el catálogo entero en el main: las ráfagas de cambios (p. ej. el
  // thumbnailer guardando miniaturas una tras otra) se agrupan en una sola petición.
  const temporizadorStats = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programarStats = useCallback(() => {
    if (temporizadorStats.current) clearTimeout(temporizadorStats.current);
    temporizadorStats.current = setTimeout(() => {
      temporizadorStats.current = null;
      void cargarStats();
    }, STATS_DEBOUNCE_MS);
  }, [cargarStats]);
  useEffect(
    () => () => {
      if (temporizadorStats.current) clearTimeout(temporizadorStats.current);
    },
    [],
  );

  // Push del main: cualquier mutación del catálogo recarga la vista y (agrupados) los contadores.
  useEffect(
    () =>
      window.gameclip.library.onChanged(() => {
        void cargar();
        programarStats();
      }),
    [cargar, programarStats],
  );

  // Cambio de día: un temporizador hasta la próxima medianoche local y, por si el equipo durmió
  // (los temporizadores se paran), una comprobación al volver a la ventana.
  // El temporizador se reprograma SIEMPRE tras saltar, aunque el día no haya cambiado (reloj
  // atrasado, cambio de zona horaria): no depende de que `setDia` cambie el estado.
  useEffect(() => {
    const comprobar = () => setDia(hoyLocal());
    let temporizador: ReturnType<typeof setTimeout>;
    const programar = () => {
      const siguiente = new Date();
      siguiente.setHours(24, 0, 1, 0); // mañana a las 00:00:01 local
      temporizador = setTimeout(
        () => {
          comprobar();
          programar();
        },
        Math.max(1000, siguiente.getTime() - Date.now()),
      );
    };
    programar();
    window.addEventListener('focus', comprobar);
    document.addEventListener('visibilitychange', comprobar);
    return () => {
      clearTimeout(temporizador);
      window.removeEventListener('focus', comprobar);
      document.removeEventListener('visibilitychange', comprobar);
    };
  }, []);

  useEffect(() => {
    claveFiltros.current = JSON.stringify([busqueda, soloFavoritos, juego]);
  }, [busqueda, soloFavoritos, juego]);

  useThumbnailer(clips);

  // `dia` no se lee dentro, pero recalcula «Hoy»/«Ayer» al cambiar de día.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const grupos = useMemo(() => groupByDate(clips ?? []), [clips, dia]);
  // Orden visual (el de los grupos): ↑ ↓ recorren la lista tal como se ve.
  const enOrden = useMemo(() => grupos.flatMap((g) => g.items), [grupos]);
  const abierto = abiertoId === null ? null : (enOrden.find((c) => c.id === abiertoId) ?? null);

  // El clip abierto se borró o salió del listado (filtro, búsqueda): el panel se cierra.
  useEffect(() => {
    if (abiertoId !== null && clips && !clips.some((c) => c.id === abiertoId)) {
      alCerrar.current = { id: abiertoId, foco: false };
      setAbiertoId(null);
    }
  }, [clips, abiertoId]);

  const abrir = useCallback((clip: Clip) => {
    setPreview(null); // con el panel abierto no hay cuadrícula ni vista previa
    // Al abrir desde la cuadrícula se recuerda su scroll y con qué filtros se veía (no al cambiar
    // de clip desde las filas).
    if (rejilla.current && !rejilla.current.hidden) {
      scrollRejilla.current = rejilla.current.scrollTop;
      filtrosAlAbrir.current = claveFiltros.current;
    }
    setAbiertoId(clip.id);
  }, []);

  /** Cierra el panel; `foco`: devolverlo a la tarjeta del clip (× y Esc; no al borrar). */
  const cerrarPanel = useCallback((id: number, foco: boolean) => {
    alCerrar.current = { id, foco };
    setPreview(null); // un arranque que quedó pendiente con el panel abierto no se cuela al volver
    setAbiertoId(null);
  }, []);

  // De vuelta en la cuadrícula:
  // - Scroll: si la lista se ve con los mismos filtros que al abrir, donde estaba (y, si entraron
  //   clips nuevos que la desplazaron, con la tarjeta del clip a la vista). Si cambiaron búsqueda,
  //   filtro o favoritos, es otra lista: arriba del todo.
  // - Foco (solo × y Esc): en la tarjeta del clip que estaba abierto; si ya no existe, la primera.
  useLayoutEffect(() => {
    const cierre = alCerrar.current;
    if (abiertoId !== null || !cierre) return;
    alCerrar.current = null;
    const el = rejilla.current;
    if (!el) return;
    const tarjeta = el.querySelector<HTMLElement>(`[data-clip-id="${cierre.id}"]`);
    if (filtrosAlAbrir.current === claveFiltros.current) {
      el.scrollTop = scrollRejilla.current;
      tarjeta?.scrollIntoView?.({ block: 'nearest' });
    } else {
      el.scrollTop = 0;
    }
    if (!cierre.foco) return;
    const destino =
      tarjeta?.querySelector<HTMLElement>('.clip-thumb') ??
      el.querySelector<HTMLElement>('.clip-thumb');
    if (!destino) return;
    // Foco devuelto por código, no por el usuario: la tarjeta no debe arrancar su vista previa
    // (acaba de cerrarse un vídeo). El evento focus es síncrono: la marca vive solo durante él.
    destino.dataset.gcSinPreview = '1';
    destino.focus({ preventScroll: true });
    delete destino.dataset.gcSinPreview;
  }, [abiertoId]);

  // Teclado del panel: Esc cierra, ↑ ↓ cambian de clip, Intro abre el editor. Con un modal abierto
  // no se atiende nada (el modal además se queda el Esc en captura).
  const hayModal = aBorrar !== null || errorBorrado !== null;
  useEffect(() => {
    if (abiertoId === null || hayModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
      // Un modal de otra parte de la app (p. ej. la versión nueva) también se queda el teclado.
      if (hayModalAbierto()) return;
      const objetivo = e.target;
      if (esCampoDeTexto(objetivo)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        cerrarPanel(abiertoId, true);
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
  }, [abiertoId, enOrden, hayModal, cerrarPanel]);

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
      if (abiertoId === clip.id) cerrarPanel(clip.id, false);
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
  // «N de M» solo con el total a mano: si los contadores fallan o aún no llegan, «N clips». Mientras
  // llega el refresco (debounce) el total puede ir por detrás: nunca «6 de 5».
  const contador =
    clips === null
      ? null
      : hayFiltros && stats && clips.length <= stats.total
        ? `${clips.length} de ${stats.total}`
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
            onClose={() => cerrarPanel(abierto.id, true)}
            onEliminar={pedirBorrado}
          />
          <ClipRows grupos={grupos} abiertoId={abierto.id} onAbrir={abrir} />
        </div>
      )}

      {clips && clips.length > 0 && (
        <div className="library-body" ref={rejilla} hidden={abierto !== null}>
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
                    previewActiva={!abierto && preview === clip.id}
                    oculta={abierto !== null}
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
