import { useEffect, useRef, useState } from 'react';
import logoUrl from '../../assets/logo.svg';
import GameIcon from '../../components/GameIcon';

interface IconoPerezosoProps {
  /** Juego cuyo icono se pide. */
  game: string;
}

/**
 * Icono de juego que solo se pide al entrar en vista. Para listas largas (el índice de detección
 * tiene cientos de juegos): resolver el icono de un juego que no está en ejecución recorre su
 * carpeta de instalación, y pedirlos todos de golpe sería una ráfaga de recorridos de disco.
 * Mientras tanto se ve el logo de GameClip, igual que la reserva de <GameIcon>.
 */
export function IconoPerezoso({ game }: IconoPerezosoProps) {
  const ref = useRef<HTMLSpanElement>(null);
  // Sin IntersectionObserver (no pasa en Electron) se pide directamente.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      // La raíz es el contenedor con scroll más cercano (la tabla); un poco de margen para que el
      // icono ya esté al llegar.
      { root: el.closest('.deteccion-tabla-scroll'), rootMargin: '120px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  if (visible) return <GameIcon game={game} />;
  return (
    <span ref={ref} className="gc-icon" aria-hidden="true" data-icon="pendiente">
      <img src={logoUrl} alt="" draggable={false} />
    </span>
  );
}
