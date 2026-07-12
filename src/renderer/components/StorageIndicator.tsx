import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StorageStats } from '@shared/library';
import { formatStorage } from '@shared/library';

const RADIO = 16;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;

/**
 * Espacio usado por los clips del catálogo sobre el límite configurado (el mismo par de cifras
 * que gobierna el auto-borrado). Se refresca con `library:changed`, que es lo que emite el main al
 * guardar, borrar o auto-borrar un clip.
 */
export default function StorageIndicator() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [limitGb, setLimitGb] = useState(0);

  const cargar = useCallback(() => {
    void window.gameclip.library
      .getStorageStats()
      .then(setStats)
      .catch(() => setStats(null));
    void window.gameclip.capture
      .getSettings()
      .then((s) => setLimitGb(s.storageLimitGb))
      .catch(() => setLimitGb(0));
  }, []);

  useEffect(() => {
    cargar();
    return window.gameclip.library.onChanged(cargar);
  }, [cargar]);

  if (!stats) return null;

  const usados = stats.clipsBytes + stats.recordingsBytes;
  const limiteBytes = limitGb * 1024 ** 3;
  const sinLimite = limitGb <= 0;
  const ratio = sinLimite ? 0 : Math.min(1, usados / limiteBytes);
  const lleno = !sinLimite && usados >= limiteBytes;

  return (
    <button
      type="button"
      className={`storage-indicator${lleno ? ' is-full' : ''}`}
      onClick={() => navigate('/ajustes/almacenamiento')}
      title="Almacenamiento usado — abrir Ajustes"
      aria-label={`Almacenamiento: ${formatStorage(usados)} de ${
        sinLimite ? 'sin límite' : `${limitGb} GB`
      }`}
    >
      <svg className="storage-ring" viewBox="0 0 40 40" aria-hidden="true">
        <circle className="storage-ring-track" cx="20" cy="20" r={RADIO} />
        {!sinLimite && (
          <circle
            className="storage-ring-value"
            cx="20"
            cy="20"
            r={RADIO}
            strokeDasharray={CIRCUNFERENCIA}
            strokeDashoffset={CIRCUNFERENCIA * (1 - ratio)}
          />
        )}
      </svg>
      <span className="storage-used">{formatStorage(usados)}</span>
      <span className="storage-limit">{sinLimite ? 'Sin límite' : `${limitGb} GB`}</span>
    </button>
  );
}
