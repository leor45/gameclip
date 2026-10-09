import type { Clip } from '@shared/library';
import { FolderGlyph, TrashGlyph } from './glyphs';

interface Props {
  clip: Clip;
  /** `card`: fila de botones-icono que aparece al apuntar o con el foco. `panel`: botones con texto. */
  variant: 'card' | 'panel';
  ocupado: boolean;
  onFavorito: () => void;
  onRenombrar: () => void;
  onEliminar: () => void;
}

/** Navegación por hash: la Biblioteca no se acopla al router (HashRouter la resuelve). */
export function abrirEditor(clipId: number): void {
  window.location.hash = `#/editor/${clipId}`;
}

/**
 * Las acciones de un clip (las mismas en la tarjeta y en el panel): favorito, renombrar y etiquetar,
 * editar, abrir carpeta y eliminar. Eliminar solo pide la confirmación: la hace la Biblioteca.
 */
export default function ClipActions({
  clip,
  variant,
  ocupado,
  onFavorito,
  onRenombrar,
  onEliminar,
}: Props) {
  const esImagen = clip.kind === 'image';
  const favLabel = clip.favorite ? 'Quitar de favoritos' : 'Marcar favorito';
  const panel = variant === 'panel';
  const base = panel ? 'gc-btn ghost sm' : '';
  const cls = (...extra: string[]) => [base, ...extra].filter(Boolean).join(' ') || undefined;

  const editar = !esImagen && (
    // El editor recorta y mezcla pistas de audio: no hay nada que hacer con una captura.
    <button
      type="button"
      className={panel ? 'gc-btn sm' : undefined}
      aria-label="Editar"
      title="Editar (recortar y mezclar audio)"
      disabled={ocupado}
      onClick={() => abrirEditor(clip.id)}
    >
      <span aria-hidden="true">✂</span>
      {panel && ' Editar'}
    </button>
  );

  return (
    <div className={panel ? 'clip-actions panel' : 'clip-actions'}>
      {panel && editar}
      <button
        type="button"
        className={cls('clip-fav', clip.favorite ? 'on' : '')}
        aria-label={favLabel}
        title={favLabel}
        disabled={ocupado}
        onClick={onFavorito}
      >
        ★
      </button>
      <button
        type="button"
        className={cls()}
        aria-label="Renombrar y etiquetar"
        title="Renombrar y etiquetar"
        disabled={ocupado}
        onClick={onRenombrar}
      >
        <span aria-hidden="true">✎</span>
        {panel && ' Renombrar y etiquetar'}
      </button>
      {!panel && editar}
      <button
        type="button"
        className={cls()}
        aria-label="Abrir carpeta"
        title="Abrir carpeta"
        disabled={ocupado}
        onClick={() => void window.gameclip.library.openFolder(clip.id)}
      >
        <FolderGlyph />
        {panel && 'Abrir carpeta'}
      </button>
      <button
        type="button"
        className={cls('clip-trash')}
        aria-label="Eliminar"
        title="Eliminar"
        disabled={ocupado}
        onClick={onEliminar}
      >
        <TrashGlyph />
        {panel && 'Eliminar'}
      </button>
    </div>
  );
}
