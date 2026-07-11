import { useEffect, useState, type FormEvent } from 'react';
import type { Clip } from '@shared/library';
import { formatDuration } from '@shared/library';
import { thumbMediaUrl } from '../lib/media';

interface Props {
  clip: Clip;
  onPlay: (clip: Clip) => void;
}

export default function ClipCard({ clip, onPlay }: Props) {
  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState(clip.title);
  const [tags, setTags] = useState(clip.tags.join(', '));
  const [ocupado, setOcupado] = useState(false);

  // Si el clip cambia desde fuera (push del main), el borrador se realinea.
  useEffect(() => {
    setTitulo(clip.title);
    setTags(clip.tags.join(', '));
  }, [clip.title, clip.tags]);

  async function accion(fn: () => Promise<unknown>) {
    setOcupado(true);
    try {
      await fn();
    } finally {
      setOcupado(false);
    }
  }

  async function guardarEdicion(e: FormEvent) {
    e.preventDefault();
    await accion(() =>
      window.gameclip.library.update(clip.id, {
        title: titulo,
        tags: tags.split(',').map((t) => t.trim()),
      }),
    );
    setEditando(false);
  }

  function eliminar() {
    const seguro = window.confirm(
      `¿Eliminar "${clip.title}"? El archivo de video también se borra del disco.`,
    );
    if (seguro) void accion(() => window.gameclip.library.remove(clip.id));
  }

  const fecha = new Date(clip.createdAt).toLocaleDateString();

  return (
    <article className="clip-card">
      <button
        type="button"
        className="clip-thumb"
        aria-label={`Reproducir ${clip.title}`}
        onClick={() => onPlay(clip)}
      >
        {clip.thumbnailPath ? (
          <img src={thumbMediaUrl(clip.id, clip.thumbnailPath)} alt="" />
        ) : (
          <span className="clip-thumb-placeholder">▶</span>
        )}
        <span className="clip-duration">{formatDuration(clip.durationSeconds)}</span>
      </button>

      {editando ? (
        <form className="clip-edit" onSubmit={(e) => void guardarEdicion(e)}>
          <input
            aria-label="Título"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            maxLength={120}
          />
          <input
            aria-label="Etiquetas (separadas por coma)"
            placeholder="etiquetas, separadas, por coma"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
          <div className="clip-edit-actions">
            <button type="submit" disabled={ocupado || !titulo.trim()}>
              Guardar
            </button>
            <button type="button" className="secondary" onClick={() => setEditando(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="clip-info">
          <h3 title={clip.title}>{clip.title}</h3>
          <p className="clip-meta">
            {clip.game ?? 'Sin juego'} · {fecha}
          </p>
          {clip.tags.length > 0 && (
            <div className="clip-tags">
              {clip.tags.map((t) => (
                <span key={t} className="clip-tag">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="clip-actions">
        <button
          type="button"
          className={clip.favorite ? 'clip-fav on' : 'clip-fav'}
          aria-label={clip.favorite ? 'Quitar de favoritos' : 'Marcar favorito'}
          disabled={ocupado}
          onClick={() =>
            void accion(() =>
              window.gameclip.library.update(clip.id, { favorite: !clip.favorite }),
            )
          }
        >
          ★
        </button>
        <button
          type="button"
          aria-label="Renombrar y etiquetar"
          disabled={ocupado}
          onClick={() => setEditando(true)}
        >
          ✎
        </button>
        <button
          type="button"
          aria-label="Abrir carpeta"
          disabled={ocupado}
          onClick={() => void window.gameclip.library.openFolder(clip.id)}
        >
          ⌂
        </button>
        <button
          type="button"
          className="danger"
          aria-label="Eliminar"
          disabled={ocupado}
          onClick={eliminar}
        >
          ✕
        </button>
      </div>
    </article>
  );
}
