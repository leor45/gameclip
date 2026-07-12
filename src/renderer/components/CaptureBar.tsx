import { useEffect, useState } from 'react';
import type { CaptureSettings, CaptureStatus } from '@shared/capture';
import { isManualGame } from '@shared/games';

const STATE_LABEL: Record<CaptureStatus['state'], string> = {
  unavailable: 'Captura no disponible',
  initializing: 'Iniciando captura…',
  idle: 'Captura lista',
  buffering: 'Buffer activo',
  recording: 'Grabando',
};

/**
 * Duraciones del clip retroactivo, dentro de los límites que ya valida el dominio (10–300 s): ningún
 * valor del control puede ser rechazado por la normalización. El valor fino sigue en Ajustes.
 */
const DURACIONES: { seconds: number; label: string }[] = [
  { seconds: 30, label: '30 s' },
  { seconds: 60, label: '1 m' },
  { seconds: 120, label: '2 m' },
  { seconds: 180, label: '3 m' },
  { seconds: 300, label: '5 m' },
];

export default function CaptureBar() {
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [settings, setSettings] = useState<CaptureSettings | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    window.gameclip.capture.getStatus().then((s) => {
      if (vivo) setStatus(s);
    });
    window.gameclip.capture.getSettings().then((s) => {
      if (vivo) setSettings(s);
    });
    const offStatus = window.gameclip.capture.onStatusChanged(setStatus);
    // Cambiar la duración (o los juegos manuales) desde Ajustes se refleja aquí en el acto.
    const offSettings = window.gameclip.capture.onSettingsChanged(setSettings);
    return () => {
      vivo = false;
      offStatus();
      offSettings();
    };
  }, []);

  if (!status) return null;

  const grabando = status.state === 'recording';
  const activo = status.state === 'buffering' || grabando;
  const juego = status.detectedGame;
  const manual = isManualGame(juego, settings?.customGames ?? []);

  async function accion(fn: () => Promise<CaptureStatus>) {
    setOcupado(true);
    try {
      setStatus(await fn());
    } finally {
      setOcupado(false);
    }
  }

  async function cambiarDuracion(replaySeconds: number) {
    setOcupado(true);
    try {
      // El main devuelve los ajustes ya normalizados; además emite settings:changed para el resto.
      setSettings(await window.gameclip.capture.setSettings({ replaySeconds }));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="capture-bar" data-state={status.state}>
      <span className={`capture-pill capture-pill-game${juego ? ' is-on' : ''}`}>
        <span aria-hidden="true">🎮</span>
        <span className="capture-game-name">{juego ?? 'Esperando juego'}</span>
        {manual && (
          <span className="capture-tag" title="Juego añadido por vos en Ajustes → Grabación">
            manual
          </span>
        )}
      </span>

      <span className="capture-pill capture-pill-state">
        <span className={`capture-dot ${grabando ? 'rec' : activo ? 'on' : 'off'}`} />
        {STATE_LABEL[status.state]}
      </span>

      {status.error && <span className="capture-error">{status.error}</span>}
      <span className="capture-spacer" />

      {status.lastClipPath && (
        <span className="capture-last" title={status.lastClipPath}>
          Último clip: {status.lastClipPath.split(/[\\/]/).pop()}
        </span>
      )}

      {settings && (
        <label className="capture-pill capture-pill-clip">
          Clip
          <select
            aria-label="Duración del clip"
            value={settings.replaySeconds}
            disabled={ocupado}
            onChange={(e) => void cambiarDuracion(Number(e.target.value))}
          >
            {/* El valor guardado puede no ser un preset (Ajustes admite cualquiera): se muestra. */}
            {!DURACIONES.some((d) => d.seconds === settings.replaySeconds) && (
              <option value={settings.replaySeconds}>{settings.replaySeconds} s</option>
            )}
            {DURACIONES.map((d) => (
              <option key={d.seconds} value={d.seconds}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {activo && (
        <button
          type="button"
          disabled={ocupado}
          onClick={() => void accion(() => window.gameclip.capture.saveReplay())}
        >
          Guardar clip
        </button>
      )}
      {activo && !grabando && (
        <button
          type="button"
          className="secondary"
          disabled={ocupado}
          onClick={() => void accion(() => window.gameclip.capture.startRecording())}
        >
          Grabar
        </button>
      )}
      {grabando && (
        <button
          type="button"
          className="danger"
          disabled={ocupado}
          onClick={() => void accion(() => window.gameclip.capture.stopRecording())}
        >
          Detener
        </button>
      )}
    </div>
  );
}
