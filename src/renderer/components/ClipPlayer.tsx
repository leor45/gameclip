import { useEffect } from 'react';
import type { Clip } from '@shared/library';
import { clipMediaUrl } from '../lib/media';

interface Props {
  clip: Clip;
  onClose: () => void;
}

export default function ClipPlayer({ clip, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="player-overlay" role="presentation" onClick={onClose}>
      <div
        className="player-panel"
        role="dialog"
        aria-label={clip.title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="player-head">
          <h2 title={clip.title}>{clip.title}</h2>
          <button type="button" aria-label="Cerrar" onClick={onClose}>
            ✕
          </button>
        </div>
        {/* El protocolo gameclip-media resuelve el archivo por id en el main. */}
        <video className="player-video" src={clipMediaUrl(clip.id)} controls autoPlay />
      </div>
    </div>
  );
}
