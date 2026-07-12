import { useEffect, useState } from 'react';
import type { OverlayState } from '@shared/ipc';
import type { OverlayNotice } from '@shared/overlay';

const VACIO: OverlayState = { recording: false, toast: null, notice: null };

/**
 * Contenido del overlay in-game. Es una vista tonta: el main decide qué mostrar y cuándo
 * (incluida la duración del toast y del aviso); aquí solo se pinta el último estado recibido.
 *
 * Lo único que el main NO decide es la animación de salida del aviso: cuánto dura una transición
 * CSS es cosa del DOM. Al llegar `notice: null`, la página sigue pintando el aviso con la clase de
 * salida y lo desmonta cuando la animación termina (`onAnimationEnd`).
 */
export default function Overlay() {
  const [state, setState] = useState<OverlayState>(VACIO);
  const [aviso, setAviso] = useState<OverlayNotice | null>(null);
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => window.gameclip.overlay.onState(setState), []);

  useEffect(() => {
    if (state.notice) {
      setAviso(state.notice);
      setSaliendo(false);
    } else {
      setSaliendo(true); // sin aviso pintado no se renderiza nada igual
    }
  }, [state.notice]);

  return (
    <div className="overlay-root">
      {aviso && (
        <div
          className={`overlay-notice${saliendo ? ' is-leaving' : ''}`}
          role="status"
          data-testid="overlay-notice"
          onAnimationEnd={() => {
            if (saliendo) setAviso(null);
          }}
        >
          <p className="overlay-notice-title">
            <span aria-hidden="true">🎮</span> {aviso.title}
          </p>
          <ul className="overlay-notice-keys">
            {aviso.hotkeys.map((h) => (
              <li key={h.key}>
                <kbd>{h.key}</kbd>
                <span>{h.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
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
