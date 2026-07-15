import { secondsToPx, type Segment } from '@shared/timeline';

interface Props {
  segments: Segment[];
  /** Offset de salida de cada segmento (contiguos, sin huecos). */
  starts: number[];
  selected: number | null;
  pxPerSecond: number;
  onSelect: (index: number) => void;
}

/**
 * Barra de cortes bajo la regla: un bloque por segmento conservado, contiguos (tiempo de salida, sin
 * huecos). El seleccionado va resaltado; clic en un bloque lo selecciona para borrarlo. Comparte la
 * escala (`pxPerSecond`) con la regla y las pistas, así que alinea con ellas.
 */
export default function SegmentBar({ segments, starts, selected, pxPerSecond, onSelect }: Props) {
  return (
    <div className="eav-segbar">
      {segments.map((s, i) => (
        <button
          key={`${i}-${s.start}`}
          type="button"
          className={i === selected ? 'eav-seg is-selected' : 'eav-seg'}
          style={{
            left: secondsToPx(starts[i], pxPerSecond),
            width: Math.max(2, secondsToPx(s.end - s.start, pxPerSecond)),
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(i);
          }}
          title={`Segmento ${i + 1}`}
          aria-label={`Segmento ${i + 1}${i === selected ? ' (seleccionado)' : ''}`}
        />
      ))}
    </div>
  );
}
