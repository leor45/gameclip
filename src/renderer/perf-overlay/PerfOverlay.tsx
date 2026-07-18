import { useEffect, useState } from 'react';
import type { PerfOverlayData } from '@shared/ipc';
import { perfLines, presetFor } from '@shared/perf';

/**
 * Contenido del overlay de rendimiento. Vista tonta: el main manda la config visual y el snapshot
 * de métricas ya medido; aquí solo se formatea (perfLines) y se pinta. La ventana es más grande que
 * el contenido (una caja fija que los sliders interpolan por el work area), así que el bloque se
 * ancla dentro según la banda del preset: en "parte superior derecha" el bloque abraza la esquina
 * derecha de la ventana, etc.
 */
export default function PerfOverlay() {
  const [data, setData] = useState<PerfOverlayData | null>(null);

  useEffect(() => window.gameclip.perf.onData(setData), []);

  if (!data) return null;
  const { config, snapshot } = data;
  const lines = perfLines(config.metrics, snapshot);
  if (!lines.length) return null;

  const preset = presetFor(config.posX, config.posY);
  const [fila, columna] = preset.split('-') as [string, string];

  return (
    <div className="perf-root" data-fila={fila} data-columna={columna} data-testid="perf-root">
      <div
        className={`perf-card perf-${config.layout}`}
        role="status"
        style={{
          color: config.textColor,
          backgroundColor: `rgba(0, 0, 0, ${config.bgOpacity / 100})`,
        }}
      >
        {lines.map((line) => (
          <span className="perf-metric" key={line.key}>
            <span className="perf-label">{line.label}</span>
            <span className="perf-value">{line.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
