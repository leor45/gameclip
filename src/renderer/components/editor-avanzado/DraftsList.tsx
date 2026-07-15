import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Clip } from '@shared/library';
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

/**
 * Lista de "ediciones sin terminar" (drafts del editor avanzado), en la pestaña Editor cuando no hay un
 * clip elegido. Cada una se puede **Retomar** o **Quitar**. Sin ninguna, invita a editar. Todo el texto
 * es sencillo (nada de "draft"/"clip"/tecnicismos).
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
    <div className="eav-drafts">
      <h2 className="eav-drafts-title">Ediciones sin terminar</h2>
      <ul className="eav-drafts-list">
        {drafts.map((d) => {
          const clip = clips.get(d.clipId);
          if (!clip) {
            return (
              <li key={d.clipId} className="eav-draft-card eav-draft-missing">
                <span className="eav-draft-title">Este vídeo ya no está en tu biblioteca</span>
                <button type="button" className="eav-btn" onClick={() => quitar(d.clipId)}>
                  Quitar
                </button>
              </li>
            );
          }
          return (
            <li key={d.clipId} className="eav-draft-card">
              <Link to={`/editor-avanzado/${d.clipId}`} className="eav-draft-thumb">
                {clip.thumbnailPath ? (
                  <img src={thumbMediaUrl(d.clipId, clip.thumbnailPath)} alt="" />
                ) : (
                  <span className="eav-draft-thumb-empty">🎬</span>
                )}
              </Link>
              <div className="eav-draft-info">
                <span className="eav-draft-title" title={clip.title}>
                  {clip.title}
                </span>
                <span className="eav-draft-time">Editado {editadoHace(d.updatedAt)}</span>
              </div>
              <div className="eav-draft-actions">
                <Link to={`/editor-avanzado/${d.clipId}`} className="eav-btn eav-btn-primary">
                  Retomar
                </Link>
                <button type="button" className="eav-btn" onClick={() => quitar(d.clipId)}>
                  Quitar
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
