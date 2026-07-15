import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Clip } from '@shared/library';
import { formatDuration } from '@shared/library';
import type { ExportQuality } from '@shared/export';
import type { ClipAudioTrack, TrackVolumes, TrackWaveform } from '@shared/tracks';
import { mutedToVolumes, selectableTracks, trackGain, trackKey, trackLabel } from '@shared/tracks';
import {
  clampTime,
  clampZoomFactor,
  deleteSegment,
  initialSegments,
  keptDuration,
  nextKeptTime,
  segmentAt,
  setSegmentsEnd,
  setSegmentsStart,
  setTrackVolume,
  sourceToOutput,
  splitAt,
  ZOOM_FACTOR_MAX,
  ZOOM_FACTOR_MIN,
  ZOOM_FACTOR_STEP,
} from '@shared/timeline';
import { editReducer, initEditState } from './editor-avanzado-edit';
import { clipMediaUrl } from '../lib/media';
import { LivePreviewAudio, effectiveGain, shouldResync } from '../lib/live-audio';
import Timeline from '../components/editor-avanzado/Timeline';
import AudioTrackRow from '../components/editor-avanzado/AudioTrackRow';
import RenderDialog from '../components/editor-avanzado/RenderDialog';

export default function EditorAvanzado() {
  const { clipId } = useParams();
  const id = clipId ? Number(clipId) : null;
  const navigate = useNavigate();

  const [clip, setClip] = useState<Clip | null>(null);
  const [noEncontrado, setNoEncontrado] = useState(false);
  const [duration, setDuration] = useState(0);
  // Edición por segmentos (Fase 3) con historial de deshacer/rehacer.
  const [edit, dispatch] = useReducer(editReducer, initEditState(initialSegments(0)));
  const segments = edit.segments;
  const [selectedSegment, setSelectedSegment] = useState<number | null>(null);
  const [tracks, setTracks] = useState<ClipAudioTrack[]>([]);
  const [waveforms, setWaveforms] = useState<TrackWaveform[]>([]);
  const [volumes, setVolumes] = useState<TrackVolumes>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [zoomFactor, setZoomFactor] = useState(ZOOM_FACTOR_MIN);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  // Alto del panel inferior (transporte + timeline). Redimensionable arrastrando el divisor; el
  // vídeo (flex) ocupa el resto.
  const [panelH, setPanelH] = useState(300);

  const [showRender, setShowRender] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  // Motor de audio en vivo (Fase 2): reconstruye la mezcla desde las pistas desglosadas, colgado del
  // reloj del <video> mudo. No-op sin AudioContext (jsdom/tests).
  const engineRef = useRef<LivePreviewAudio | null>(null);
  useEffect(() => {
    const engine = new LivePreviewAudio();
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Refs con el estado vivo, para que los listeners (rueda del teclado, rAF) no se re-suscriban.
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const playheadRef = useRef(0);
  playheadRef.current = playhead;
  const selectedRef = useRef<number | null>(null);
  selectedRef.current = selectedSegment;
  // Objetivo del salto de hueco en curso: evita re-emitir el seek cada frame mientras se asienta.
  const skipTargetRef = useRef<number | null>(null);
  // Borde inicial/final al empezar a recortar: el arrastre reporta un delta sobre esta base (robusto
  // frente al re-escalado de la timeline compactada).
  const trimBaseRef = useRef({ firstStart: 0, lastEnd: 0 });
  function beginTrim() {
    const segs = segmentsRef.current;
    trimBaseRef.current = { firstStart: segs[0].start, lastEnd: segs[segs.length - 1].end };
    dispatch({ type: 'beginDrag' });
  }

  // Operaciones de corte (entran en el historial). Estables: leen el estado vivo por refs.
  const splitAtPlayhead = useCallback(() => {
    const cur = segmentsRef.current;
    const next = splitAt(cur, playheadRef.current);
    if (next !== cur) {
      dispatch({ type: 'commit', segments: next });
      setSelectedSegment(null);
    }
  }, []);

  const deleteSelected = useCallback(() => {
    const sel = selectedRef.current;
    if (sel == null) return;
    const cur = segmentsRef.current;
    const next = deleteSegment(cur, sel);
    if (next !== cur) {
      dispatch({ type: 'commit', segments: next });
      setSelectedSegment(null);
    }
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: 'undo' });
    setSelectedSegment(null);
  }, []);
  const redo = useCallback(() => {
    dispatch({ type: 'redo' });
    setSelectedSegment(null);
  }, []);

  // Atajos de teclado del editor: dividir (S), borrar (Supr), deshacer/rehacer (Ctrl+Z / Ctrl+Y /
  // Ctrl+Shift+Z). Se ignora si el foco está en un control de texto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (ctrl && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (ctrl && k === 'y') {
        e.preventDefault();
        redo();
      } else if (!ctrl && k === 's') {
        e.preventDefault();
        splitAtPlayhead();
      } else if (k === 'delete' || k === 'backspace') {
        e.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [splitAtPlayhead, deleteSelected, undo, redo]);

  useEffect(() => {
    if (!id || !Number.isInteger(id) || id <= 0) return;
    let vivo = true;
    window.gameclip.library
      .get(id)
      .then((c) => {
        if (!vivo) return;
        setClip(c);
        setNoEncontrado(c === null);
        if (c) {
          const d = c.durationSeconds ?? 0;
          setDuration(d);
          dispatch({ type: 'reset', segments: initialSegments(d) });
          setVolumes(mutedToVolumes(c.mutedTracks));
        }
      })
      .catch(() => setNoEncontrado(true));
    window.gameclip.editor
      .getAudioTracks(id)
      .then((t) => vivo && setTracks(selectableTracks(t)))
      .catch(() => setTracks([]));
    window.gameclip.editor
      .getWaveforms(id)
      .then((w) => vivo && setWaveforms(w))
      .catch(() => setWaveforms([]));
    return () => {
      vivo = false;
    };
  }, [id]);

  // Progreso del render (evento del main).
  useEffect(() => window.gameclip.exporter.onProgress(({ ratio }) => setProgress(ratio)), []);

  // El playhead sigue al vídeo mientras suena; y salta los huecos borrados (ripple en la preview).
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      const engine = engineRef.current;
      if (v) {
        const t = v.currentTime;
        const segs = segmentsRef.current;
        // Ripple: si el playhead entró en un hueco, salta al siguiente segmento; si pasó el final, para.
        if (segs.length > 0 && segmentAt(segs, t) < 0) {
          const next = nextKeptTime(segs, t);
          if (next === null) {
            skipTargetRef.current = null;
            v.pause();
            engine?.stop();
            setPlaying(false);
            setPlayhead(segs[segs.length - 1].end);
            return; // no reprograma: al pasar playing a false, el efecto se limpia
          }
          // Emite el salto UNA sola vez. Además SILENCIA el audio durante el seek del <video>: el
          // seek tarda ~100-300 ms en asentarse y, si el audio siguiera sonando, adelantaría al vídeo
          // y el resync lo devolvería atrás — se oiría "doble" al reanudar. Se re-arranca al aterrizar.
          if (skipTargetRef.current !== next) {
            skipTargetRef.current = next;
            v.currentTime = next;
            engine?.stop();
            setPlayhead(next);
          }
        } else if (skipTargetRef.current !== null) {
          // Acabamos de aterrizar tras un salto: re-arranca el audio SOLO cuando el vídeo dejó de
          // buscar, para que imagen y sonido reanuden juntos (sin desfase ni eco).
          setPlayhead(t);
          if (!v.seeking) {
            skipTargetRef.current = null;
            engine?.play(t);
          }
        } else {
          setPlayhead(t);
          // El vídeo manda: si el audio se separó del vídeo, se re-sincroniza (raro con relojes cerca).
          if (engine && shouldResync(engine.audioTime(), t)) engine.seek(t);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const seek = useCallback(
    (seconds: number) => {
      const s = clampTime(seconds, duration);
      const v = videoRef.current;
      if (v) v.currentTime = s;
      engineRef.current?.seek(s);
      setPlayhead(s);
    },
    [duration],
  );

  if (!id || noEncontrado) {
    return (
      <div className="editor-avanzado eav-empty">
        <p>Ese clip ya no está disponible.</p>
        <button type="button" className="eav-btn" onClick={() => navigate('/biblioteca')}>
          Volver a la biblioteca
        </button>
      </div>
    );
  }

  function onMetadata() {
    const d = videoRef.current?.duration;
    if (d && Number.isFinite(d) && duration === 0) {
      setDuration(d);
      dispatch({ type: 'reset', segments: initialSegments(d) });
    }
  }

  // Carga (perezosa, en el primer play) el audio por pista y devuelve si el audio EN VIVO va a sonar.
  // Si no (sin Web Audio, sin pistas, o ninguna decodificó), el editor cae a la mezcla original del
  // <video> — nunca queda en silencio total.
  async function ensureAudioLoaded(): Promise<boolean> {
    const engine = engineRef.current;
    if (!engine || !engine.enabled || tracks.length === 0) return false;
    if (!engine.isLoaded) {
      setAudioLoading(true);
      try {
        await engine.load(
          tracks.map((t) => trackKey(t)),
          (key) => {
            const track = tracks.find((t) => trackKey(t) === key);
            return track && id
              ? window.gameclip.editor.getTrackAudio(id, track.index)
              : Promise.resolve(new ArrayBuffer(0));
          },
        );
      } finally {
        setAudioLoading(false);
      }
    }
    // Aplica los volúmenes actuales antes de que suene (removed → 0).
    for (const t of tracks) {
      const key = trackKey(t);
      engine.setGain(key, effectiveGain(trackGain(volumes, key), removed.has(key)));
    }
    return engine.hasBuffers();
  }

  async function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      engineRef.current?.resume(); // dentro del gesto de usuario (política de autoplay)
      const live = await ensureAudioLoaded();
      // Con audio en vivo, el <video> va mudo (lo pone el motor). Si no, suena la mezcla original.
      v.muted = live;
      // `play()` puede devolver undefined en algunos entornos (jsdom): se envuelve para no romper.
      void Promise.resolve(v.play()).catch(() => undefined);
      if (live) engineRef.current?.play(v.currentTime);
      setPlaying(true);
    } else {
      v.pause();
      engineRef.current?.stop();
      setPlaying(false);
    }
  }

  function stop() {
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.currentTime = 0;
    }
    engineRef.current?.stop();
    setPlaying(false);
    setPlayhead(0);
  }

  // Arrastre del divisor: sube/baja el alto del panel inferior (acotado). Arrastrar hacia ARRIBA
  // agranda el panel de pistas (deltaY negativo → más alto).
  function onResizeDown(e: React.PointerEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = panelH;
    const max = window.innerHeight - 160; // deja sitio para la barra superior y algo de preview
    const move = (ev: PointerEvent) => {
      setPanelH(Math.min(max, Math.max(140, startH + (startY - ev.clientY))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function setGain(key: string, gain: number) {
    setVolumes((prev) => setTrackVolume(prev, key, gain));
    engineRef.current?.setGain(key, effectiveGain(gain, removed.has(key)));
  }

  function toggleRemove(key: string) {
    const willRemove = !removed.has(key);
    setRemoved((prev) => {
      const next = new Set(prev);
      if (willRemove) next.add(key);
      else next.delete(key);
      return next;
    });
    engineRef.current?.setGain(key, willRemove ? 0 : trackGain(volumes, key));
  }

  async function render(quality: ExportQuality) {
    if (!clip) return;
    setRendering(true);
    setProgress(0);
    setRenderError(null);
    setDone(false);
    // Misma ganancia efectiva que oye la preview en vivo (Fase 2): garantiza preview = render.
    const trackVolumes: TrackVolumes = {};
    for (const t of tracks) {
      const k = trackKey(t);
      trackVolumes[k] = effectiveGain(trackGain(volumes, k), removed.has(k));
    }
    const res = await window.gameclip.exporter.run({
      clipId: clip.id,
      startSeconds: segments[0].start,
      endSeconds: segments[segments.length - 1].end,
      format: 'mp4',
      quality,
      trackVolumes,
      // Solo se mandan segmentos si hay cortes (2+); con uno, el rango simple basta.
      ...(segments.length >= 2 ? { segments } : {}),
    });
    setRendering(false);
    if (res.status === 'done') {
      setShowRender(false);
      setDone(true);
    } else if (res.status === 'error') {
      setRenderError(res.message ?? 'El render falló.');
    }
    // 'canceled' (el usuario cerró el diálogo de guardado o canceló): sin mensaje, se queda el modal.
  }

  const fecha = clip ? new Date(clip.createdAt).toLocaleString() : '';

  return (
    <div className="editor-avanzado">
      <header className="eav-topbar">
        <span className="eav-topbar-title" title={clip?.title}>
          ✎ {clip?.title ?? 'Cargando…'}
          <span className="eav-topbar-date">{fecha}</span>
        </span>
        <div className="eav-topbar-center">
          <button type="button" className="eav-btn eav-btn-ghost" disabled title="Próximamente">
            Horizontal (16:9) ▾
          </button>
          <button type="button" className="eav-btn eav-btn-ghost" disabled title="Próximamente" aria-label="Captura de frame">
            📷
          </button>
        </div>
        <div className="eav-topbar-right">
          <button type="button" className="eav-btn" onClick={() => navigate('/biblioteca')}>
            Salir
          </button>
          <button
            type="button"
            className="eav-btn eav-btn-primary"
            onClick={() => {
              setDone(false);
              setRenderError(null);
              setShowRender(true);
            }}
          >
            Renderizar vídeo
          </button>
        </div>
      </header>

      <div className="eav-preview">
        <video
          ref={videoRef}
          className="eav-video"
          src={clipMediaUrl(id)}
          onLoadedMetadata={onMetadata}
          onEnded={() => {
            engineRef.current?.stop();
            setPlaying(false);
          }}
        />
        {done && (
          <div className="eav-done">
            Render listo ✓
            <button type="button" className="eav-btn" onClick={() => void window.gameclip.exporter.showLast()}>
              Mostrar en carpeta
            </button>
          </div>
        )}
      </div>

      <div
        className="eav-resizer"
        onPointerDown={onResizeDown}
        role="separator"
        aria-label="Redimensionar el panel de pistas"
        aria-orientation="horizontal"
      />

      <div className="eav-bottom" style={{ height: panelH }}>
        <div className="eav-toolbar">
        <button
          type="button"
          className="eav-btn"
          onClick={() => void togglePlay()}
          disabled={audioLoading}
          aria-label={playing ? 'Pausar' : 'Reproducir'}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <button type="button" className="eav-btn" onClick={stop} aria-label="Detener">
          ■
        </button>
        <span className="eav-time">
          {formatDuration(sourceToOutput(segments, playhead))} / {formatDuration(keptDuration(segments))}
        </span>
        {audioLoading && <span className="eav-audio-loading">Cargando audio…</span>}
        <span className="eav-toolbar-sep" />
        <button type="button" className="eav-btn" onClick={splitAtPlayhead} aria-label="Dividir" title="Dividir en el cursor (S)">
          ✂ Dividir
        </button>
        <button
          type="button"
          className="eav-btn"
          onClick={deleteSelected}
          disabled={selectedSegment === null || segments.length <= 1}
          aria-label="Borrar segmento"
          title="Borrar el segmento seleccionado (Supr)"
        >
          🗑 Borrar
        </button>
        <button
          type="button"
          className="eav-btn"
          onClick={undo}
          disabled={edit.past.length === 0}
          aria-label="Deshacer"
          title="Deshacer (Ctrl+Z)"
        >
          ↶
        </button>
        <button
          type="button"
          className="eav-btn"
          onClick={redo}
          disabled={edit.future.length === 0}
          aria-label="Rehacer"
          title="Rehacer (Ctrl+Y)"
        >
          ↷
        </button>
        <span className="eav-toolbar-spacer" />
        <span className="eav-trim-info">
          Duración: {formatDuration(keptDuration(segments))}
          {segments.length > 1 && ` · ${segments.length} segmentos`}
        </span>
        <button
          type="button"
          className="eav-btn"
          onClick={() => setZoomFactor((z) => clampZoomFactor(z / ZOOM_FACTOR_STEP))}
          disabled={zoomFactor <= ZOOM_FACTOR_MIN}
          aria-label="Alejar"
        >
          –
        </button>
        <button
          type="button"
          className="eav-btn"
          onClick={() => setZoomFactor((z) => clampZoomFactor(z * ZOOM_FACTOR_STEP))}
          disabled={zoomFactor >= ZOOM_FACTOR_MAX}
          aria-label="Acercar"
        >
          +
        </button>
      </div>

      <Timeline
        zoomFactor={zoomFactor}
        playhead={playhead}
        segments={segments}
        selectedSegment={selectedSegment}
        onSeek={seek}
        onSelectSegment={(i) => setSelectedSegment((prev) => (prev === i ? null : i))}
        onTrimBegin={beginTrim}
        onTrimCommit={() => dispatch({ type: 'endDrag' })}
        onTrimStartBy={(delta) =>
          dispatch({
            type: 'live',
            segments: setSegmentsStart(segmentsRef.current, trimBaseRef.current.firstStart + delta, duration),
          })
        }
        onTrimEndBy={(delta) =>
          dispatch({
            type: 'live',
            segments: setSegmentsEnd(segmentsRef.current, trimBaseRef.current.lastEnd + delta, duration),
          })
        }
      >
        <div className="eav-track eav-track-video">
          <div className="eav-track-head">
            <span className="eav-track-name">🎬 {clip?.game ?? 'Vídeo'}</span>
          </div>
          <div className="eav-track-video-bar" />
        </div>
        <ul className="eav-audio-list">
          {tracks.map((t) => {
            const key = trackKey(t);
            return (
              <AudioTrackRow
                key={key}
                trackKey={key}
                label={trackLabel(t)}
                gain={trackGain(volumes, key)}
                peaks={waveforms.find((w) => w.key === key)?.peaks ?? []}
                removed={removed.has(key)}
                segments={segments}
                duration={duration}
                onSetGain={setGain}
                onToggleRemove={toggleRemove}
              />
            );
          })}
          {tracks.length === 0 && <li className="eav-audio-empty">Este clip no tiene pistas de audio editables.</li>}
        </ul>
      </Timeline>
      </div>

      {showRender && (
        <RenderDialog
          rendering={rendering}
          progress={progress}
          error={renderError}
          onRender={(q) => void render(q)}
          onCancelRender={() => void window.gameclip.exporter.cancel()}
          onClose={() => setShowRender(false)}
        />
      )}
    </div>
  );
}
