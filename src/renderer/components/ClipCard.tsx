import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Clip } from '@shared/library';
import { formatDuration, formatFileSize } from '@shared/library';
import { clipMediaUrl, thumbMediaUrl } from '../lib/media';

/** Segundos de clip que muestra la preview antes de volver al principio. */
const PREVIEW_SECONDS = 10;
/** Retardo antes de arrancar: barrer la grilla con el mouse no debe disparar una preview por card. */
const PREVIEW_DELAY_MS = 250;

interface Props {
  clip: Clip;
  onPlay: (clip: Clip) => void;
  /** ¿Esta tarjeta es la que previsualiza? Lo decide la grilla (solo una a la vez). */
  previewActiva?: boolean;
  /** Avisa a la grilla de que el cursor entró (true) o salió (false). */
  onPreviewChange?: (activa: boolean) => void;
}

/** El usuario pidió menos animación: la preview no se reproduce (queda el borde y el thumbnail). */
function prefiereMenosMovimiento(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export default function ClipCard({ clip, onPlay, previewActiva, onPreviewChange }: Props) {
  const esImagen = clip.kind === 'image';
  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState(clip.title);
  const [tags, setTags] = useState(clip.tags.join(', '));
  const [ocupado, setOcupado] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Si el clip cambia desde fuera (push del main), el borrador se realinea.
  useEffect(() => {
    setTitulo(clip.title);
    setTags(clip.tags.join(', '));
  }, [clip.title, clip.tags]);

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
    if (!seguro) return;
    // Soltar la preview desmonta el <video>, que es lo que en Windows tiene el archivo abierto e
    // impide borrarlo. Cerrar el handle es asíncrono; el main además reintenta el borrado.
    onPreviewChange?.(false);
    void accion(async () => {
      try {
        await window.gameclip.library.remove(clip.id);
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'No se pudo borrar el clip.');
      }
    });
  }

  const fecha = new Date(clip.createdAt).toLocaleDateString();

  const poster = clip.thumbnailPath ? thumbMediaUrl(clip.id, clip.thumbnailPath) : undefined;

  return (
    <article
      className="clip-card"
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
        {previewActiva && !esImagen ? (
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
        <span className="clip-duration">
          {esImagen ? 'Captura' : formatDuration(clip.durationSeconds)}
        </span>
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
          <p className="clip-size">{formatFileSize(clip.sizeBytes)}</p>
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
          title={clip.favorite ? 'Quitar de favoritos' : 'Marcar favorito'}
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
          title="Renombrar y etiquetar"
          disabled={ocupado}
          onClick={() => setEditando(true)}
        >
          ✎
        </button>
        {/* El editor recorta y mezcla pistas de audio: no hay nada que hacer con una captura. */}
        {!esImagen && (
          <button
            type="button"
            aria-label="Editar"
            title="Editar (recortar y mezclar audio)"
            disabled={ocupado}
            onClick={() => {
              // Navegación por hash: la tarjeta no se acopla al router (HashRouter la resuelve).
              window.location.hash = `#/editor/${clip.id}`;
            }}
          >
            ✂
          </button>
        )}
        <button
          type="button"
          aria-label="Abrir carpeta"
          title="Abrir carpeta"
          disabled={ocupado}
          onClick={() => void window.gameclip.library.openFolder(clip.id)}
        >
          ⌂
        </button>
        <button
          type="button"
          className="clip-trash"
          aria-label="Eliminar"
          title="Eliminar"
          disabled={ocupado}
          onClick={eliminar}
        >
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
            <path
              fill="currentColor"
              d="M6 1h4l.5 1H14v2H2V2h3.5L6 1zm-2.5 4h9L12 15H4L3.5 5zm3 2v6h1V7h-1zm2.5 0v6h1V7h-1z"
            />
          </svg>
        </button>
      </div>
    </article>
  );
}
