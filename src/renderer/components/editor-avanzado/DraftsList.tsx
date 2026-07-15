import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Clip } from '@shared/library';
import { formatDuration } from '@shared/library';
import { deleteDraft, listDrafts, type EditorDraft } from '../../lib/editor-drafts';
import { thumbMediaUrl } from '../../lib/media';

/** Texto sencillo del tiempo transcurrido: "hace un momento", "hace 5 min", "hace 2 h", "hace 3 días". */
function editadoHace(updatedAt: number): string {
  const s = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  if (s < 60) return 'hace un momento';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d > 1 ? 'días' : 'día'}`;
}

const trashIcon = (
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
    <path
      fill="currentColor"
      d="M6 1h4l.5 1H14v2H2V2h3.5L6 1zm-2.5 4h9L12 15H4L3.5 5zm3 2v6h1V7h-1zm2.5 0v6h1V7h-1z"
    />
  </svg>
);

/**
 * Lista de "ediciones sin terminar" (drafts del editor avanzado), en la pestaña Editor cuando no hay un
 * clip elegido. Mismo diseño de tarjetas en cuadrícula que la Biblioteca. Cada una se puede **Retomar**
 * (thumbnail o ✂) o **Quitar** (🗑). Sin ninguna, invita a editar. Copy sencilla (nada de "draft").
 */
export default function DraftsList() {
  const [drafts, setDrafts] = useState<EditorDraft[]>(() => listDrafts());
  const [clips, setClips] = useState<Map<number, Clip>>(new Map());

  useEffect(() => {
    let vivo = true;
    window.gameclip.library
      .list()
      .then((cs) => vivo && setClips(new Map(cs.map((c) => [c.id, c]))))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  function quitar(clipId: number) {
    deleteDraft(clipId);
    setDrafts((prev) => prev.filter((d) => d.clipId !== clipId));
  }

  if (drafts.length === 0) {
    return (
      <p className="placeholder">
        Aquí aparecerán tus ediciones sin terminar. Elige un clip en la{' '}
        <Link to="/biblioteca">Biblioteca</Link> y pulsa «Editar» para recortarlo, ajustar el audio y
        exportarlo.
      </p>
    );
  }

  return (
    <>
      <h2 className="eav-drafts-title">Ediciones sin terminar</h2>
      <div className="library-grid">
        {drafts.map((d) => {
          const clip = clips.get(d.clipId);
          const to = `/editor-avanzado/${d.clipId}`;
          const poster = clip?.thumbnailPath ? thumbMediaUrl(d.clipId, clip.thumbnailPath) : undefined;
          return (
            <article className="clip-card" key={d.clipId}>
              {clip ? (
                <Link className="clip-thumb" to={to} aria-label={`Retomar ${clip.title}`}>
                  {poster ? (
                    <img src={poster} alt="" />
                  ) : (
                    <span className="clip-thumb-placeholder">🎬</span>
                  )}
                  <span className="clip-duration">{formatDuration(clip.durationSeconds)}</span>
                </Link>
              ) : (
                <div className="clip-thumb">
                  <span className="clip-thumb-placeholder">🎬</span>
                </div>
              )}

              <div className="clip-info">
                <h3 title={clip?.title}>{clip ? clip.title : 'Este vídeo ya no está en tu biblioteca'}</h3>
                <p className="clip-meta">
                  {clip ? `Editado ${editadoHace(d.updatedAt)}` : 'La edición no se puede retomar.'}
                </p>
              </div>

              <div className="clip-actions">
                {clip && (
                  <Link
                    className="clip-action-link"
                    to={to}
                    aria-label="Retomar"
                    title="Retomar la edición"
                  >
                    ✂
                  </Link>
                )}
                <button
                  type="button"
                  className="clip-trash"
                  aria-label="Quitar"
                  title="Quitar esta edición"
                  onClick={() => quitar(d.clipId)}
                >
                  {trashIcon}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
