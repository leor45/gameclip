import { useEffect, useRef } from 'react';
import type { Clip } from '@shared/library';
import { clipsLabel, type DateGroup } from '../../lib/libraryGroups';
import { thumbMediaUrl } from '../../lib/media';
import { selloDe } from '../ClipCard';
import GameLine from './GameLine';

interface Props {
  grupos: DateGroup<Clip>[];
  /** Clip abierto en el panel: su fila va marcada. */
  abiertoId: number;
  onAbrir: (clip: Clip) => void;
}

/**
 * Índice en filas junto al panel reproductor, con los mismos grupos por fecha que la cuadrícula.
 * Aquí no hay vista previa al pasar el cursor: ya suena el clip abierto.
 */
export default function ClipRows({ grupos, abiertoId, onAbrir }: Props) {
  const lista = useRef<HTMLDivElement>(null);

  // La fila abierta siempre a la vista (↑ ↓ pueden llevarla fuera del scroll). Si el foco estaba en
  // otra fila, lo sigue: así Intro (editor) actúa sobre el clip que se ve.
  useEffect(() => {
    const fila = lista.current?.querySelector<HTMLElement>('[aria-current="true"]');
    fila?.scrollIntoView?.({ block: 'nearest' });
    const foco = document.activeElement;
    if (fila && foco !== fila && foco instanceof HTMLElement && foco.closest('.lib-row')) {
      fila.focus();
    }
  }, [abiertoId]);

  let n = 0;
  return (
    <div className="lib-rows" ref={lista}>
      {grupos.map((g) => (
        <section key={g.key} className="library-group" aria-label={g.label}>
          <h2 className="library-group-head">
            {g.label}
            <span>{clipsLabel(g.items.length)}</span>
          </h2>
          <ul className="lib-rows-list">
            {g.items.map((clip) => {
              n++;
              const on = clip.id === abiertoId;
              const poster = clip.thumbnailPath
                ? thumbMediaUrl(clip.id, clip.thumbnailPath)
                : undefined;
              return (
                <li key={clip.id}>
                  <button
                    type="button"
                    className={on ? 'lib-row on' : 'lib-row'}
                    aria-current={on ? 'true' : undefined}
                    data-clip-id={clip.id}
                    onClick={() => onAbrir(clip)}
                  >
                    <span className="lib-row-num">{n}</span>
                    <span className="lib-row-thumb">
                      {poster ? (
                        <img src={poster} alt="" />
                      ) : (
                        <span aria-hidden="true">{clip.kind === 'image' ? '🖼' : '▶'}</span>
                      )}
                    </span>
                    <span className="lib-row-text">
                      <b>
                        {clip.favorite && <span className="clip-star">★ </span>}
                        {clip.title}
                      </b>
                      <GameLine game={clip.game} />
                    </span>
                    <span className="lib-row-dur">{selloDe(clip)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
