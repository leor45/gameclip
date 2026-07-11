import { useEffect, useState } from 'react';
import type { OverlayState } from '@shared/ipc';

/**
 * Contenido del overlay in-game. Es una vista tonta: el main decide qué mostrar y cuándo
 * (incluida la duración del toast); aquí solo se pinta el último estado recibido.
 */
export default function Overlay() {
  const [state, setState] = useState<OverlayState>({ recording: false, toast: null });

  useEffect(() => window.gameclip.overlay.onState(setState), []);

  return (
    <div className="overlay-root">
      {state.recording && (
        <div className="overlay-pill overlay-rec" role="status">
          <span className="overlay-rec-dot" aria-hidden="true" />
          REC
        </div>
      )}
      {state.toast && (
        <div className="overlay-pill overlay-toast" role="status">
          {state.toast}
        </div>
      )}
    </div>
  );
}
