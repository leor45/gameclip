import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StorageStats } from '@shared/library';
import { formatStorage } from '@shared/library';

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

  // Dos fuentes, cada una con lo suyo: el catálogo mueve los bytes usados y los ajustes, el límite.
  useEffect(() => {
    cargar();
    const offCatalogo = window.gameclip.library.onChanged(cargar);
    const offAjustes = window.gameclip.capture.onSettingsChanged((s) =>
      setLimitGb(s.storageLimitGb),
    );
    return () => {
      offCatalogo();
      offAjustes();
    };
  }, [cargar]);

  if (!stats) return null;

  // Las capturas cuentan: el auto-borrado compara el límite contra el total, y si la barra las
  // ignorara, diría menos de lo que la app está midiendo.
  const usados = stats.clipsBytes + stats.recordingsBytes + stats.screenshotsBytes;
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
      <span className="storage-head">
        <span className="gc-label">Almacenamiento</span>
      </span>
      <span className="storage-figures">
        <span className="storage-used">{formatStorage(usados)}</span>
        <span className="storage-limit">{sinLimite ? 'Sin límite' : `${limitGb} GB`}</span>
      </span>
      {!sinLimite && (
        <span className="storage-meter" aria-hidden="true">
          <i style={{ width: `${ratio * 100}%` }} />
        </span>
      )}
    </button>
  );
}
