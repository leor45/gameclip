import { useState } from 'react';
import type { Clip } from '@shared/library';
import { formatFileSize } from '@shared/library';
import { clipMediaUrl } from '../lib/media';
import { selloDe } from './ClipCard';
import ClipActions from './library/ClipActions';
import ClipEditForm from './library/ClipEditForm';
import GameLine from './library/GameLine';
import { useClipAcciones } from './library/useClipAcciones';

interface Props {
  clip: Clip;
  onClose: () => void;
  onEliminar: (clip: Clip) => void;
}

/**
 * Panel reproductor de la Biblioteca (sustituye a la ventana modal): el vídeo o la imagen arriba y,
 * debajo, la fecha, la duración, el título, el juego y las mismas acciones de la tarjeta. Esc, ↑ ↓ e
 * Intro los atiende la Biblioteca, que es quien conoce la lista.
 *
 * Quien lo monta le pone `key={clip.id}`: al cambiar de clip se desmonta entero, con el `<video>`
 * anterior (en Windows tiene el archivo abierto) y el formulario de renombrar a medio escribir.
 */
export default function ClipPlayer({ clip, onClose, onEliminar }: Props) {
  const esImagen = clip.kind === 'image';
  const [editando, setEditando] = useState(false);
  const { ocupado, alternarFavorito, guardar } = useClipAcciones(clip);
  const fecha = new Date(clip.createdAt).toLocaleDateString();

  return (
    <section className="lib-player" aria-label={clip.title}>
      <div className="lib-player-media">
        {/* El protocolo gameclip-media resuelve el archivo por id en el main, sea video o captura. */}
        {esImagen ? (
          <img className="lib-player-video" src={clipMediaUrl(clip.id)} alt={clip.title} />
        ) : (
          <video
            className="lib-player-video"
            data-testid="player-video"
            src={clipMediaUrl(clip.id)}
            controls
            autoPlay
          />
        )}
        <button
          type="button"
          className="lib-player-close"
          aria-label="Cerrar"
          title="Cerrar (Esc)"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <div className="lib-player-info">
        <p className="lib-player-meta">
          {fecha} · {selloDe(clip)} · {formatFileSize(clip.sizeBytes)}
        </p>
        {editando ? (
          <ClipEditForm
            clip={clip}
            ocupado={ocupado}
            onGuardar={guardar}
            onCancelar={() => setEditando(false)}
          />
        ) : (
          <>
            <h2 className="lib-player-title gc-display" title={clip.title}>
              {clip.favorite && (
                <span className="clip-star" aria-label="Favorito">
                  ★{' '}
                </span>
              )}
              {clip.title}
            </h2>
            <GameLine game={clip.game} />
            {clip.tags.length > 0 && (
              <div className="clip-tags">
                {clip.tags.map((t) => (
                  <span key={t} className="clip-tag">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
        <ClipActions
          clip={clip}
          variant="panel"
          ocupado={ocupado}
          onFavorito={alternarFavorito}
          onRenombrar={() => setEditando(true)}
          onEliminar={() => onEliminar(clip)}
        />
      </div>
    </section>
  );
}
