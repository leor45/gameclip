import { useEffect, useState } from 'react';
import type { OverlayState } from '@shared/ipc';
import type { OverlayNotice } from '@shared/overlay';

const VACIO: OverlayState = { recording: false, toast: null, notice: null };

/**
 * Contenido del overlay in-game. Es una vista tonta: el main decide qué mostrar y cuándo (incluida
 * la duración del toast y del aviso), y cada ventana recibe **el estado filtrado** con lo que le
 * toca a su esquina — por eso aquí no hay ninguna noción de izquierda o derecha.
 *
 * Lo único que el main NO decide es la animación de salida: cuánto dura una transición CSS es cosa
 * del DOM. Al llegar el `null`, la página sigue pintando la tarjeta con la clase de salida y la
 * desmonta cuando la animación termina (`onAnimationEnd`).
 */
export default function Overlay() {
  const [state, setState] = useState<OverlayState>(VACIO);

  useEffect(() => window.gameclip.overlay.onState(setState), []);

  const aviso = useSalida(state.notice);
  const toast = useSalida(state.toast);

  return (
    <div className="overlay-root">
      {aviso.valor && (
        <div
          className={`overlay-card${aviso.saliendo ? ' is-leaving' : ''}`}
          role="status"
          data-testid="overlay-notice"
          onAnimationEnd={aviso.alTerminarSalida}
        >
          <p className="overlay-card-title">
            <span aria-hidden="true">🎮</span> {aviso.valor.title}
          </p>
          <ul className="overlay-card-keys">
            {aviso.valor.hotkeys.map((h) => (
              <li key={h.key}>
                <kbd>{h.key}</kbd>
                <span>{h.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* El toast usa la misma tarjeta que el aviso: el overlay habla con una sola voz. */}
      {toast.valor && (
        <div
          className={`overlay-card overlay-toast${toast.saliendo ? ' is-leaving' : ''}`}
          role="status"
          onAnimationEnd={toast.alTerminarSalida}
        >
          <p className="overlay-card-title">{toast.valor}</p>
        </div>
      )}

      {state.recording && (
        <div className="overlay-pill overlay-rec" role="status">
          <span className="overlay-rec-dot" aria-hidden="true" />
          REC
        </div>
      )}
    </div>
  );
}

/**
 * Mantiene vivo el último valor recibido mientras se anima su salida. Devuelve qué pintar, si está
 * saliendo, y el handler que lo desmonta al terminar la animación.
 */
function useSalida<T extends OverlayNotice | string>(entrante: T | null) {
  const [valor, setValor] = useState<T | null>(null);
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => {
    if (entrante) {
      setValor(entrante);
      setSaliendo(false);
    } else {
      setSaliendo(true); // sin nada pintado no se renderiza igual
    }
  }, [entrante]);

  return {
    valor,
    saliendo,
    alTerminarSalida: () => {
      if (saliendo) setValor(null);
    },
  };
}
