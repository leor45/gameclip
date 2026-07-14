import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ExportFormat, ExportQuality } from '@shared/export';
import type { Clip } from '@shared/library';
import { formatDuration } from '@shared/library';
import type { ClipAudioTrack } from '@shared/tracks';
import { hasRoleTracks, selectableTracks, trackKey, trackLabel } from '@shared/tracks';
import { clipMediaUrl } from '../lib/media';

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
      <section>
        <h1>Editor</h1>
        <p className="placeholder">
          Elige un clip en la <Link to="/biblioteca">Biblioteca</Link> y pulsa "Editar" para
          recortarlo y exportarlo.
        </p>
      </section>
    );
  }

  if (noEncontrado) {
    return (
      <section>
        <h1>Editor</h1>
        <p className="placeholder">
          Ese clip ya no está en la biblioteca. Vuelve a la{' '}
          <Link to="/biblioteca">Biblioteca</Link>.
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
    if (video && !video.paused && video.currentTime >= finRef.current) {
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
    const resultado = await window.gameclip.exporter.run({
      clipId: clip!.id,
      startSeconds: inicio,
      endSeconds: fin,
      format: formato,
      quality: calidad,
      mutedTracks: muteadas,
    });
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
      <div className="editor-head">
        <h1>Editor</h1>
        <Link className="editor-avanzado-link" to={`/editor-avanzado/${clip.id}`}>
          Editor avanzado →
        </Link>
      </div>
      <h2 className="editor-clip-title" title={clip.title}>
        {clip.title}
      </h2>

      <video
        ref={videoRef}
        className="editor-video"
        src={clipMediaUrl(clip.id, version)}
        controls
        onLoadedMetadata={onMetadata}
        onTimeUpdate={onTimeUpdate}
      />

      <fieldset className="editor-trim" disabled={ocupado}>
        <legend>Recorte</legend>
        <label>
          Inicio del recorte ({formatDuration(inicio)})
          <input
            type="range"
            min={0}
            max={duracion}
            step={PASO}
            value={inicio}
            aria-label="Inicio del recorte"
            onChange={(e) =>
              setInicio(Math.min(Number(e.target.value), Math.max(0, fin - MIN_RECORTE)))
            }
          />
        </label>
        <label>
          Fin del recorte ({formatDuration(fin)})
          <input
            type="range"
            min={0}
            max={duracion}
            step={PASO}
            value={fin}
            aria-label="Fin del recorte"
            onChange={(e) =>
              setFin(Math.max(Number(e.target.value), Math.min(duracion, inicio + MIN_RECORTE)))
            }
          />
        </label>
        <div className="editor-trim-info">
          <span>Duración del recorte: {formatDuration(Math.max(0, fin - inicio))}</span>
          <button type="button" onClick={previsualizar}>
            Previsualizar recorte
          </button>
        </div>
      </fieldset>

      {seleccionables.length > 0 && (
        <fieldset className="editor-tracks" disabled={ocupado}>
          <legend>Pistas de audio</legend>
          <ul className="editor-tracks-list">
            {seleccionables.map((pista) => {
              const key = trackKey(pista);
              return (
                <li key={key}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!muteadas.includes(key)}
                      onChange={() => togglePista(key)}
                    />
                    <span>{trackLabel(pista)}</span>
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
              Este clip trae una sola pista de audio (se grabó en modo escritorio con un solo audio,
              o antes de que existieran las pistas por rol), así que su mezcla no se puede rehacer:
              solo se puede exportar con o sin audio.
            </p>
          )}
        </fieldset>
      )}

      <fieldset className="editor-export" disabled={ocupado}>
        <legend>Exportar</legend>
        <label>
          Formato
          <select
            aria-label="Formato"
            value={formato}
            onChange={(e) => setFormato(e.target.value as ExportFormat)}
          >
            <option value="mp4">MP4 (H.264)</option>
            <option value="gif">GIF animado</option>
          </select>
        </label>
        <label>
          Calidad
          <select
            aria-label="Calidad"
            value={calidad}
            onChange={(e) => setCalidad(e.target.value as ExportQuality)}
          >
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
        </label>
      </fieldset>

      <div className="editor-actions">
        {!exportando && (
          <button
            type="button"
            className="primary"
            disabled={guardandoEdit}
            onClick={() => void exportar()}
          >
            Exportar…
          </button>
        )}
        {!exportando && seleccionables.length > 0 && (
          <button
            type="button"
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
        {estadoEdit === 'guardado' && <span className="editor-copied">Edit guardado ✓</span>}
        {exportando && (
          <>
            <progress aria-label="Progreso de exportación" max={1} value={progreso} />
            <span className="editor-progress-label">{Math.round(progreso * 100)} %</span>
            <button type="button" onClick={() => void window.gameclip.exporter.cancel()}>
              Cancelar
            </button>
          </>
        )}
      </div>

      {estado === 'hecho' && (
        <div className="editor-done">
          <span>Exportación lista.</span>
          <button type="button" onClick={() => void copiar()}>
            Copiar al portapapeles
          </button>
          <button type="button" onClick={() => void window.gameclip.exporter.showLast()}>
            Mostrar en carpeta
          </button>
          {copiado && <span className="editor-copied">Copiado ✓</span>}
        </div>
      )}
      {estado === 'error' && mensaje && <p className="editor-error">{mensaje}</p>}
      {estadoEdit === 'error' && mensajeEdit && <p className="editor-error">{mensajeEdit}</p>}
    </section>
  );
}
