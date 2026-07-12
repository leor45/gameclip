import { useEffect, useState } from 'react';
import type { StorageStats } from '@shared/library';
import { formatStorage } from '@shared/library';
import { SeccionForm } from './SeccionForm';
import { useCaptureSettings } from './useCaptureSettings';

const LIMITE_OPCIONES_GB = [0, 5, 10, 20, 50, 100, 250, 500];

export default function AjustesAlmacenamiento() {
  const { settings, set, save, saving, saved } = useCaptureSettings();
  const [stats, setStats] = useState<StorageStats | null>(null);

  useEffect(() => {
    let vivo = true;
    window.gameclip.library
      .getStorageStats()
      .then((s) => {
        if (vivo) setStats(s);
      })
      .catch(() => {
        // Si la API falla, se oculta la barra de uso sin romper el resto de la sección.
        if (vivo) setStats(null);
      });
    return () => {
      vivo = false;
    };
  }, []);

  if (!settings) return <p className="placeholder">Cargando…</p>;

  async function elegirCarpeta() {
    const ruta = await window.gameclip.capture.pickOutputDir();
    if (ruta) set('outputDir', ruta);
  }

  const total = stats ? stats.driveTotalBytes : 0;
  const otrosBytes =
    stats && total > 0
      ? Math.max(0, total - stats.driveFreeBytes - stats.clipsBytes - stats.recordingsBytes)
      : 0;
  // El catálogo puede contar clips de otra unidad: normalizar para que los segmentos
  // nunca sumen más del 100 % de la barra.
  const denominador = stats
    ? Math.max(total, stats.clipsBytes + stats.recordingsBytes + otrosBytes + stats.driveFreeBytes)
    : 0;

  return (
    <SeccionForm saving={saving} saved={saved} onGuardar={() => void save()}>
      <fieldset>
        <legend>Carpeta de clips</legend>
        <label>
          Carpeta
          <input
            type="text"
            readOnly
            value={settings.outputDir}
            placeholder="Videos\GameClip (por defecto)"
          />
        </label>
        <button type="button" onClick={() => void elegirCarpeta()}>
          Cambiar…
        </button>
      </fieldset>

      <fieldset>
        <legend>Límite de almacenamiento</legend>
        <label>
          Límite
          <select
            value={settings.storageLimitGb}
            onChange={(e) => set('storageLimitGb', Number(e.target.value))}
          >
            {LIMITE_OPCIONES_GB.map((gb) => (
              <option key={gb} value={gb}>
                {gb === 0 ? 'Sin límite' : `${gb} GB`}
              </option>
            ))}
          </select>
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.autoDeleteOldest}
            onChange={(e) => set('autoDeleteOldest', e.target.checked)}
          />
          Borrar automáticamente lo más viejo al superar el límite
        </label>
        {settings.autoDeleteOldest && (
          <p className="settings-hint">Los borrados no se pueden deshacer.</p>
        )}
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.onlyDeleteRecordings}
            onChange={(e) => set('onlyDeleteRecordings', e.target.checked)}
          />
          Solo borrar grabaciones (nunca clips de replay)
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.useRecycleBin}
            onChange={(e) => set('useRecycleBin', e.target.checked)}
          />
          Enviar a la papelera de reciclaje en vez de borrar definitivamente
        </label>
      </fieldset>

      {stats && total > 0 && (
        <fieldset>
          <legend>Uso de disco</legend>
          <div className="storage-bar" role="img" aria-label="Uso de disco">
            <span
              className="storage-seg storage-seg-clips"
              style={{ width: `${(stats.clipsBytes / denominador) * 100}%` }}
            />
            <span
              className="storage-seg storage-seg-recordings"
              style={{ width: `${(stats.recordingsBytes / denominador) * 100}%` }}
            />
            <span
              className="storage-seg storage-seg-other"
              style={{ width: `${(otrosBytes / denominador) * 100}%` }}
            />
            <span
              className="storage-seg storage-seg-free"
              style={{ width: `${(stats.driveFreeBytes / denominador) * 100}%` }}
            />
          </div>
          <ul className="storage-legend">
            <li>
              <span className="storage-dot storage-seg-clips" />
              Clips: {formatStorage(stats.clipsBytes)}
            </li>
            <li>
              <span className="storage-dot storage-seg-recordings" />
              Grabaciones: {formatStorage(stats.recordingsBytes)}
            </li>
            <li>
              <span className="storage-dot storage-seg-other" />
              Otros: {formatStorage(otrosBytes)}
            </li>
            <li>
              <span className="storage-dot storage-seg-free" />
              Libre: {formatStorage(stats.driveFreeBytes)}
            </li>
          </ul>
        </fieldset>
      )}
    </SeccionForm>
  );
}
