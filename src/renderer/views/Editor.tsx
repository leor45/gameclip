import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ExportFormat, ExportQuality, ExportResult } from '@shared/export';
import type { Clip } from '@shared/library';
import { formatDuration } from '@shared/library';
import type { ClipAudioTrack } from '@shared/tracks';
import { hasRoleTracks, selectableTracks, trackKey, trackLabel } from '@shared/tracks';
import { clipMediaUrl } from '../lib/media';
import DraftsList from '../components/editor-avanzado/DraftsList';
import GameIcon from '../components/GameIcon';
import TrimStrip from '../components/TrimStrip';
import VideoPlayer from '../components/library/VideoPlayer';

type Estado = 'listo' | 'exportando' | 'hecho' | 'error';
type EstadoEdit = 'listo' | 'guardando' | 'guardado' | 'error';

const PASO = 0.1;
const MIN_RECORTE = 0.5;

export default function Editor() {
  const { clipId } = useParams();
  const id = clipId ? Number(clipId) : null;

  const [clip, setClip] = useState<Clip | null>(null);
  const [noEncontrado, setNoEncontrado] = useState(false);
  const [duracion, setDuracion] = useState(0);
  const [inicio, setInicio] = useState(0);
  const [fin, setFin] = useState(0);
  const [formato, setFormato] = useState<ExportFormat>('mp4');
  const [calidad, setCalidad] = useState<ExportQuality>('media');
  const [estado, setEstado] = useState<Estado>('listo');
  const [progreso, setProgreso] = useState(0);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pistas, setPistas] = useState<ClipAudioTrack[]>([]);
  const [muteadas, setMuteadas] = useState<string[]>([]);
  const [estadoEdit, setEstadoEdit] = useState<EstadoEdit>('listo');
  const [mensajeEdit, setMensajeEdit] = useState<string | null>(null);
  // Sube al guardar el edit: el archivo cambió y hay que sacar al reproductor de su caché.
  const [version, setVersion] = useState(0);
  // Posición del reproductor, para la línea de reproducción de la tira del recorte.
  const [actual, setActual] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const finRef = useRef(0);
  finRef.current = fin;

  useEffect(() => {
    if (!id || !Number.isInteger(id) || id <= 0) return;
    let vivo = true;
    window.gameclip.library
      .get(id)
      .then((c) => {
        if (!vivo) return;
        setClip(c);
        setNoEncontrado(c === null);
        setMuteadas(c?.mutedTracks ?? []);
        const dur = c?.durationSeconds ?? 0;
        setDuracion(dur);
        setInicio(0);
        setFin(dur);
      })
      .catch(() => setNoEncontrado(true));
    window.gameclip.editor
      .getAudioTracks(id)
      .then((t) => {
        if (vivo) setPistas(t);
      })
      .catch(() => setPistas([]));
    return () => {
      vivo = false;
    };
  }, [id]);

  useEffect(() => window.gameclip.exporter.onProgress(({ ratio }) => setProgreso(ratio)), []);

  if (!id) {
    return (
      <section className="editor-page">
        <h1 className="editor-title gc-display">Editor</h1>
        <DraftsList />
      </section>
    );
  }

  if (noEncontrado) {
    return (
      <section className="editor-page">
        <h1 className="editor-title gc-display">Editor</h1>
        <p className="placeholder">
          Ese clip ya no está en la biblioteca. Vuelve a la <Link to="/biblioteca">Biblioteca</Link>
          .
        </p>
      </section>
    );
  }

  if (!clip) return null;

  // La duración puede faltar en el catálogo: el <video> la aporta al cargar metadatos.
  function onMetadata() {
    const dur = videoRef.current?.duration;
    if (dur && Number.isFinite(dur) && duracion === 0) {
      setDuracion(dur);
      setFin(dur);
    }
  }

  function previsualizar() {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = inicio;
    try {
      void video.play();
    } catch {
      // jsdom/formatos raros: la previsualización es best-effort
    }
  }

  function onTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;
    setActual(video.currentTime);
    if (!video.paused && video.currentTime >= finRef.current) {
      video.pause();
    }
  }

  function togglePista(key: string) {
    setEstadoEdit('listo');
    setMuteadas((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function exportar() {
    setEstado('exportando');
    setProgreso(0);
    setMensaje(null);
    setCopiado(false);
    let resultado: ExportResult;
    try {
      resultado = await window.gameclip.exporter.run({
        clipId: clip!.id,
        startSeconds: inicio,
        endSeconds: fin,
        format: formato,
        quality: calidad,
        mutedTracks: muteadas,
      });
    } catch (err) {
      // Si el IPC rechaza (pedido inválido, canal caído), se trata como un error más: sin esto el
      // botón desaparecía y la barra se quedaba al 0 % para siempre.
      resultado = { status: 'error', message: err instanceof Error ? err.message : String(err) };
    }
    if (resultado.status === 'done') {
      setEstado('hecho');
    } else if (resultado.status === 'canceled') {
      setEstado('listo');
    } else {
      setEstado('error');
      setMensaje(resultado.message ?? 'La exportación falló.');
    }
  }

  /** Reescribe la mezcla del clip guardado; las pistas muteadas siguen en el archivo. */
  async function guardarEdit() {
    setEstadoEdit('guardando');
    setMensajeEdit(null);
    // El edit reemplaza el archivo, y Windows no deja renombrar sobre un archivo abierto: mientras
    // el <video> tenga el clip cargado, la propia app lo mantiene tomado (protocolo de medios con
    // stream) y el guardado falla con EPERM. Se suelta antes de pedirlo y se recarga al terminar.
    soltarVideo();
    const resultado = await window.gameclip.editor.saveAudioEdit(clip!.id, muteadas);
    if (resultado.status === 'done') {
      setEstadoEdit('guardado');
    } else {
      setEstadoEdit('error');
      setMensajeEdit(resultado.message ?? 'No se pudo guardar el edit.');
    }
    // Siempre: el <video> se quedó sin src, y con éxito además el archivo cambió (cache-busting).
    setVersion((v) => v + 1);
  }

  /** Cierra el handle que Chromium tiene sobre el archivo del clip. */
  function soltarVideo() {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
  }

  async function copiar() {
    const ok = await window.gameclip.exporter.copyLast();
    setCopiado(ok);
  }

  const exportando = estado === 'exportando';
  const guardandoEdit = estadoEdit === 'guardando';
  const ocupado = exportando || guardandoEdit;
  const seleccionables = selectableTracks(pistas);
  const puedeGuardarEdit = hasRoleTracks(pistas);

  return (
    <section className="editor">
      <div className="editor-col editor-col-main">
        <div className="editor-head">
          <h1 className="editor-title gc-display">Editor</h1>
          <h2 className="editor-clip-title" title={clip.title}>
            <GameIcon game={clip.game} size="md" />
            <span>{clip.title}</span>
          </h2>
          <Link className="editor-avanzado-link" to={`/editor-avanzado/${clip.id}`}>
            Editor avanzado →
          </Link>
        </div>

        <div className="editor-stage">
          <div className="editor-stack">
            <div className="editor-media">
              <VideoPlayer
                src={clipMediaUrl(clip.id, version)}
                title={clip.title}
                autoPlay={false}
                videoRef={videoRef}
                marca={{ inicio, fin }}
                onLoadedMetadata={onMetadata}
                onTimeUpdate={onTimeUpdate}
              />
            </div>
            <fieldset className="editor-trim" disabled={ocupado}>
              <legend className="gc-label">Recorte</legend>
              <span className="editor-trim-times">
                <span className="gc-label">Entrada</span>
                <b>{formatDuration(inicio)}</b>
                <span className="gc-label">Salida</span>
                <b>{formatDuration(fin)}</b>
              </span>
              <TrimStrip
                clipId={clip.id}
                duracion={duracion}
                inicio={inicio}
                fin={fin}
                actual={actual}
                paso={PASO}
                disabled={ocupado}
                onInicio={(v) => setInicio(Math.min(v, Math.max(0, fin - MIN_RECORTE)))}
                onFin={(v) => setFin(Math.max(v, Math.min(duracion, inicio + MIN_RECORTE)))}
              />
            </fieldset>
          </div>
        </div>
      </div>

      <aside className="editor-col editor-col-side" aria-label="Exportar">
        <div className="editor-summary">
          <span className="gc-label">Vas a exportar</span>
          <div className="editor-summary-figures">
            <div>
              <b className="editor-figure">{formatDuration(Math.max(0, fin - inicio))}</b>
              <span className="editor-figure-sub">de {formatDuration(duracion)}</span>
            </div>
            <div>
              <b className="editor-figure">{formato === 'gif' ? 'GIF' : 'MP4'}</b>
              <span className="editor-figure-sub">calidad {calidad}</span>
            </div>
          </div>
          <button
            type="button"
            className="gc-btn ghost editor-preview"
            disabled={ocupado}
            onClick={previsualizar}
          >
            <PreviewGlyph />
            Previsualizar recorte
          </button>
        </div>

        <div className="editor-side-body">
          {seleccionables.length > 0 && (
            <fieldset className="editor-tracks" disabled={ocupado}>
              <legend className="gc-label">Pistas de audio</legend>
              <ul className="editor-tracks-list">
                {seleccionables.map((pista) => {
                  const key = trackKey(pista);
                  return (
                    <li key={key}>
                      <label>
                        <span>{trackLabel(pista)}</span>
                        <input
                          type="checkbox"
                          className="gc-switch"
                          checked={!muteadas.includes(key)}
                          onChange={() => togglePista(key)}
                        />
                      </label>
                    </li>
                  );
                })}
              </ul>
              <p className="editor-tracks-hint">
                {formato === 'gif'
                  ? 'El GIF no lleva audio: las pistas solo afectan a "Guardar edit".'
                  : 'El MP4 exportado lleva la mezcla de las pistas marcadas.'}
              </p>
              {!puedeGuardarEdit && (
                <p className="editor-tracks-hint">
                  Este clip trae una sola pista de audio (se grabó en modo escritorio con un solo
                  audio, o antes de que existieran las pistas por rol), así que su mezcla no se
                  puede rehacer: solo se puede exportar con o sin audio.
                </p>
              )}
            </fieldset>
          )}

          <fieldset className="editor-export" disabled={ocupado}>
            <legend className="gc-label">Formato</legend>
            <div className="editor-opts" role="radiogroup" aria-label="Formato">
              {FORMATOS.map((f) => (
                <label key={f.valor} className="editor-opt">
                  <input
                    type="radio"
                    name="editor-formato"
                    value={f.valor}
                    checked={formato === f.valor}
                    onChange={() => setFormato(f.valor)}
                  />
                  <b>{f.nombre}</b>
                  <span>{f.detalle}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="editor-export" disabled={ocupado}>
            <legend className="gc-label">Calidad</legend>
            <div className="editor-opts" role="radiogroup" aria-label="Calidad">
              {CALIDADES.map((c) => (
                <label key={c.valor} className="editor-opt is-center">
                  <input
                    type="radio"
                    name="editor-calidad"
                    value={c.valor}
                    checked={calidad === c.valor}
                    onChange={() => setCalidad(c.valor)}
                  />
                  <b>{c.nombre}</b>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="editor-side-foot">
          {!exportando && (
            <div className="editor-actions">
              <button
                type="button"
                className="gc-btn editor-export-btn"
                disabled={guardandoEdit}
                onClick={() => void exportar()}
              >
                Exportar…
              </button>
              {seleccionables.length > 0 && (
                <button
                  type="button"
                  className="gc-btn ghost"
                  disabled={!puedeGuardarEdit || guardandoEdit}
                  title={
                    puedeGuardarEdit
                      ? 'Aplica el mute al clip guardado (sin borrar pistas)'
                      : 'Este clip no tiene pistas por rol'
                  }
                  onClick={() => void guardarEdit()}
                >
                  {guardandoEdit ? 'Guardando…' : 'Guardar edit'}
                </button>
              )}
            </div>
          )}
          {exportando && (
            <div className="editor-progress">
              <div className="editor-progress-row">
                <progress aria-label="Progreso de exportación" max={1} value={progreso} />
                <span className="editor-progress-label">{Math.round(progreso * 100)} %</span>
              </div>
              <button
                type="button"
                className="gc-btn ghost sm"
                onClick={() => void window.gameclip.exporter.cancel()}
              >
                Cancelar
              </button>
            </div>
          )}
          {estadoEdit === 'guardado' && <span className="editor-copied">Edit guardado ✓</span>}

          {estado === 'hecho' && (
            <div className="editor-done">
              <span>Exportación lista.</span>
              <div className="editor-done-actions">
                <button type="button" className="gc-btn ghost sm" onClick={() => void copiar()}>
                  Copiar al portapapeles
                </button>
                <button
                  type="button"
                  className="gc-btn ghost sm"
                  onClick={() => void window.gameclip.exporter.showLast()}
                >
                  Mostrar en carpeta
                </button>
              </div>
              {copiado && <span className="editor-copied">Copiado ✓</span>}
            </div>
          )}
          {estado === 'error' && mensaje && <p className="editor-error">{mensaje}</p>}
          {estadoEdit === 'error' && mensajeEdit && <p className="editor-error">{mensajeEdit}</p>}
        </div>
      </aside>
    </section>
  );
}

/** Formatos de exportación: qué implica cada uno, a la vista. */
const FORMATOS: { valor: ExportFormat; nombre: string; detalle: string }[] = [
  { valor: 'mp4', nombre: 'MP4', detalle: 'H.264 · con audio' },
  { valor: 'gif', nombre: 'GIF', detalle: 'Animado · sin audio' },
];

const CALIDADES: { valor: ExportQuality; nombre: string }[] = [
  { valor: 'alta', nombre: 'Alta' },
  { valor: 'media', nombre: 'Media' },
  { valor: 'baja', nombre: 'Baja' },
];

function PreviewGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path fill="currentColor" d="M4.5 2.5v11l9-5.5z" />
    </svg>
  );
}
