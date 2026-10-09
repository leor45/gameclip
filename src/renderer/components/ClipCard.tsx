import { useEffect, useRef, useState } from 'react';
import type { Clip } from '@shared/library';
import { formatDuration, formatFileSize } from '@shared/library';
import { clipMediaUrl, thumbMediaUrl } from '../lib/media';
import ClipActions from './library/ClipActions';
import ClipEditForm from './library/ClipEditForm';
import GameLine from './library/GameLine';
import { useClipAcciones } from './library/useClipAcciones';

/** Segundos de clip que muestra la preview antes de volver al principio. */
const PREVIEW_SECONDS = 10;
/** Retardo antes de arrancar: barrer la grilla con el mouse no debe disparar una preview por card. */
const PREVIEW_DELAY_MS = 250;

interface Props {
  clip: Clip;
  onPlay: (clip: Clip) => void;
  /** Pide confirmar el borrado (el modal lo pone la Biblioteca). */
  onEliminar: (clip: Clip) => void;
  /** ¿Esta tarjeta es la que previsualiza? Lo decide la grilla (solo una a la vez). */
  previewActiva?: boolean;
  /** Avisa a la grilla de que el cursor entró (true) o salió (false). */
  onPreviewChange?: (activa: boolean) => void;
}

/** El usuario pidió menos animación: la preview no se reproduce (queda el borde y el thumbnail). */
function prefiereMenosMovimiento(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Duración del clip, o «Captura» si es una imagen. */
export function selloDe(clip: Clip): string {
  return clip.kind === 'image' ? 'Captura' : formatDuration(clip.durationSeconds);
}

export default function ClipCard({
  clip,
  onPlay,
  onEliminar,
  previewActiva,
  onPreviewChange,
}: Props) {
  const esImagen = clip.kind === 'image';
  const [editando, setEditando] = useState(false);
  const { ocupado, alternarFavorito, guardar } = useClipAcciones(clip);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Al desmontar (filtro, borrado, navegación) no puede quedar un arranque pendiente.
  useEffect(() => cancelarPreview, []);

  function cancelarPreview() {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
  }

  function entrar() {
    // Una captura no tiene nada que reproducir: el hover le deja solo el borde.
    if (esImagen || prefiereMenosMovimiento()) return;
    cancelarPreview();
    temporizador.current = setTimeout(() => onPreviewChange?.(true), PREVIEW_DELAY_MS);
  }

  function salir() {
    cancelarPreview();
    onPreviewChange?.(false);
  }

  const fecha = new Date(clip.createdAt).toLocaleDateString();
  const poster = clip.thumbnailPath ? thumbMediaUrl(clip.id, clip.thumbnailPath) : undefined;
  const sonando = Boolean(previewActiva && !esImagen);

  return (
    <article
      className="clip-card"
      data-clip-id={clip.id}
      onMouseEnter={entrar}
      onMouseLeave={salir}
      onFocus={entrar}
      onBlur={salir}
    >
      <button
        type="button"
        className="clip-thumb"
        aria-label={`${esImagen ? 'Ver' : 'Reproducir'} ${clip.title}`}
        onClick={() => onPlay(clip)}
      >
        {/* La preview se MONTA al apuntar y se DESMONTA al salir: pausarla dejaría vivos el búfer
            y el decodificador, y la app corre mientras el usuario juega. */}
        {sonando ? (
          <video
            className="clip-preview"
            data-testid={`preview-${clip.id}`}
            src={clipMediaUrl(clip.id)}
            poster={poster}
            muted
            autoPlay
            loop
            playsInline
            preload="metadata"
            // HTML no sabe acotar la reproducción a un rango: el bucle de los primeros segundos se
            // hace a mano. `loop` cubre además el clip más corto que la ventana.
            onTimeUpdate={(e) => {
              const video = e.currentTarget;
              if (video.currentTime >= PREVIEW_SECONDS) video.currentTime = 0;
            }}
          />
        ) : poster ? (
          <img src={poster} alt="" />
        ) : (
          <span className="clip-thumb-placeholder">{esImagen ? '🖼' : '▶'}</span>
        )}
        {/* El sello (duración) se aparta mientras suena la vista previa. */}
        {sonando ? (
          <span className="clip-preview-tag">vista previa</span>
        ) : (
          <span className="clip-duration">{selloDe(clip)}</span>
        )}
      </button>

      {editando ? (
        <ClipEditForm
          clip={clip}
          ocupado={ocupado}
          onGuardar={guardar}
          onCancelar={() => setEditando(false)}
        />
      ) : (
        <div className="clip-info">
          <h3 title={clip.title}>
            {clip.favorite && (
              <span className="clip-star" aria-label="Favorito">
                ★{' '}
              </span>
            )}
            {clip.title}
          </h3>
          <GameLine game={clip.game} />
          <p className="clip-meta">
            <span>{fecha}</span>
            <span aria-hidden="true"> · </span>
            <span className="clip-size">{formatFileSize(clip.sizeBytes)}</span>
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

      <ClipActions
        clip={clip}
        variant="card"
        ocupado={ocupado}
        onFavorito={alternarFavorito}
        onRenombrar={() => setEditando(true)}
        onEliminar={() => onEliminar(clip)}
      />
    </article>
  );
}
