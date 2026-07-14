import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Clip } from '@shared/library';
import { formatDuration } from '@shared/library';
import type { ExportQuality } from '@shared/export';
import type { ClipAudioTrack, TrackVolumes, TrackWaveform } from '@shared/tracks';
import { mutedToVolumes, selectableTracks, trackGain, trackKey, trackLabel } from '@shared/tracks';
import {
  clampTime,
  clampZoom,
  setTrackVolume,
  setTrimEnd,
  setTrimStart,
  ZOOM_DEFAULT,
  type Trim,
} from '@shared/timeline';
import { clipMediaUrl } from '../lib/media';
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
  const [trim, setTrim] = useState<Trim>({ start: 0, end: 0 });
  const [tracks, setTracks] = useState<ClipAudioTrack[]>([]);
  const [waveforms, setWaveforms] = useState<TrackWaveform[]>([]);
  const [volumes, setVolumes] = useState<TrackVolumes>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);

  const [showRender, setShowRender] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);

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
          setTrim({ start: 0, end: d });
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

  // El playhead sigue al vídeo mientras suena.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v) setPlayhead(v.currentTime);
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
      setTrim({ start: 0, end: d });
    }
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play().catch(() => undefined);
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }

  function stop() {
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.currentTime = 0;
    }
    setPlaying(false);
    setPlayhead(0);
  }

  function setGain(key: string, gain: number) {
    setVolumes((prev) => setTrackVolume(prev, key, gain));
  }

  function toggleRemove(key: string) {
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function render(quality: ExportQuality) {
    if (!clip) return;
    setRendering(true);
    setProgress(0);
    setRenderError(null);
    setDone(false);
    const trackVolumes: TrackVolumes = {};
    for (const t of tracks) {
      const k = trackKey(t);
      trackVolumes[k] = removed.has(k) ? 0 : trackGain(volumes, k);
    }
    const res = await window.gameclip.exporter.run({
      clipId: clip.id,
      startSeconds: trim.start,
      endSeconds: trim.end,
      format: 'mp4',
      quality,
      trackVolumes,
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
          onEnded={() => setPlaying(false)}
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

      <div className="eav-toolbar">
        <button type="button" className="eav-btn" onClick={togglePlay} aria-label={playing ? 'Pausar' : 'Reproducir'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <button type="button" className="eav-btn" onClick={stop} aria-label="Detener">
          ■
        </button>
        <span className="eav-time">
          {formatDuration(playhead)} / {formatDuration(duration)}
        </span>
        <span className="eav-toolbar-spacer" />
        <span className="eav-trim-info">Recorte: {formatDuration(Math.max(0, trim.end - trim.start))}</span>
        <button type="button" className="eav-btn" onClick={() => setZoom((z) => clampZoom(z / 1.4))} aria-label="Alejar">
          –
        </button>
        <button type="button" className="eav-btn" onClick={() => setZoom((z) => clampZoom(z * 1.4))} aria-label="Acercar">
          +
        </button>
      </div>

      <Timeline
        duration={duration}
        zoom={zoom}
        playhead={playhead}
        trim={trim}
        onSeek={seek}
        onTrimStart={(s) => setTrim((t) => setTrimStart(t, s, duration))}
        onTrimEnd={(s) => setTrim((t) => setTrimEnd(t, s, duration))}
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
                onSetGain={setGain}
                onToggleRemove={toggleRemove}
              />
            );
          })}
          {tracks.length === 0 && <li className="eav-audio-empty">Este clip no tiene pistas de audio editables.</li>}
        </ul>
      </Timeline>

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
