import { useEffect, useState } from 'react';
import type { CaptureStatus } from '@shared/capture';

const STATE_LABEL: Record<CaptureStatus['state'], string> = {
  unavailable: 'Captura no disponible',
  initializing: 'Iniciando captura…',
  idle: 'Captura lista',
  buffering: 'Buffer activo',
  recording: 'Grabando',
};

export default function CaptureBar() {
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    window.gameclip.capture.getStatus().then((s) => {
      if (vivo) setStatus(s);
    });
    const off = window.gameclip.capture.onStatusChanged(setStatus);
    return () => {
      vivo = false;
      off();
    };
  }, []);

  if (!status) return null;

  const grabando = status.state === 'recording';
  const activo = status.state === 'buffering' || grabando;

  async function accion(fn: () => Promise<CaptureStatus>) {
    setOcupado(true);
    try {
      setStatus(await fn());
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="capture-bar" data-state={status.state}>
      <span className={`capture-dot ${grabando ? 'rec' : activo ? 'on' : 'off'}`} />
      <span className="capture-label">{STATE_LABEL[status.state]}</span>
      {status.detectedGame && (
        <span className="capture-game" title="Juego detectado">
          🎮 {status.detectedGame}
        </span>
      )}
      {status.error && <span className="capture-error">{status.error}</span>}
      <span className="capture-spacer" />
      {status.lastClipPath && (
        <span className="capture-last" title={status.lastClipPath}>
          Último clip: {status.lastClipPath.split(/[\\/]/).pop()}
        </span>
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
