import { useEffect, useState } from 'react';
import type { CaptureSettings, CaptureStatus } from '@shared/capture';
import { isManualGame } from '@shared/games';
import type { GameIndex } from '@shared/games';
import DurationMenu from './DurationMenu';
import GameIcon from './GameIcon';

const STATE_LABEL: Record<CaptureStatus['state'], string> = {
  unavailable: 'Captura no disponible',
  initializing: 'Iniciando captura…',
  idle: 'Captura lista',
  buffering: 'Buffer activo',
  recording: 'Grabando',
};

export default function CaptureBar() {
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [settings, setSettings] = useState<CaptureSettings | null>(null);
  const [index, setIndex] = useState<GameIndex>({});
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    window.gameclip.capture.getStatus().then((s) => {
      if (vivo) setStatus(s);
    });
    window.gameclip.capture.getSettings().then((s) => {
      if (vivo) setSettings(s);
    });
    // El índice hace falta para saber si el juego activo es manual: su nombre puede venir de ahí.
    window.gameclip.games.getIndex().then((i) => {
      if (vivo) setIndex(i);
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
  const manual = isManualGame(juego, { customGames: settings?.customGames ?? [], index });

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

  const ultimoClip = status.lastClipPath?.split(/[\\/]/).pop();

  return (
    <div className="capture-bar" data-state={status.state}>
      <GameIcon game={juego ?? null} size="lg" />
      <span className={`cap-game gc-display${juego ? '' : ' is-wait'}`}>
        {juego ?? 'Esperando juego'}
      </span>
      {manual && (
        <span className="cap-tag" title="Juego añadido por vos en Ajustes → Grabación">
          manual
        </span>
      )}

      {/* Con el buffer activo (el estado normal) basta el punto; el resto de estados se escriben. */}
      {status.state === 'buffering' ? (
        <span
          className="gc-dot on"
          role="img"
          aria-label={STATE_LABEL.buffering}
          title={STATE_LABEL.buffering}
        />
      ) : (
        <>
          <span className={`gc-dot${grabando ? ' rec' : ''}`} aria-hidden="true" />
          <span className={`cap-state${grabando ? ' is-rec' : ''}`}>{STATE_LABEL[status.state]}</span>
        </>
      )}

      {status.error && (
        <span className="cap-error" title={status.error}>
          {status.error}
        </span>
      )}
      <span className="cap-spacer" />

      {status.lastClipPath && (
        <span className="cap-last" title={status.lastClipPath}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="1.5" y="3" width="13" height="10" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M6.5 6l3.5 2-3.5 2z" fill="currentColor" />
          </svg>
          <span className="cap-last-name">{ultimoClip}</span>
        </span>
      )}

      {activo ? (
        <div className="cap-split">
          <button
            type="button"
            className="cap-split-main"
            disabled={ocupado}
            onClick={() => void accion(() => window.gameclip.capture.saveReplay())}
          >
            Guardar clip
          </button>
          {settings && (
            <DurationMenu
              variant="split"
              seconds={settings.replaySeconds}
              disabled={ocupado}
              onSelect={cambiarDuracion}
            />
          )}
        </div>
      ) : (
        // Sin «Guardar clip» (captura no lista) la duración sigue al alcance, como el selector de antes.
        settings && (
          <DurationMenu
            variant="solo"
            seconds={settings.replaySeconds}
            disabled={ocupado}
            onSelect={cambiarDuracion}
          />
        )
      )}

      {activo && !grabando && (
        <button
          type="button"
          className="gc-btn ghost icon cap-rec"
          aria-label="Grabar"
          title="Grabar"
          disabled={ocupado}
          onClick={() => void accion(() => window.gameclip.capture.startRecording())}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="5" fill="currentColor" />
          </svg>
        </button>
      )}
      {grabando && (
        <button
          type="button"
          className="gc-btn danger icon cap-stop"
          aria-label="Detener"
          title="Detener"
          disabled={ocupado}
          onClick={() => void accion(() => window.gameclip.capture.stopRecording())}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="currentColor" />
          </svg>
        </button>
      )}
    </div>
  );
}

